"""Shared approval engine: employee -> manager (-> skip-level) -> completed."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Approval, CompanySettings, RolePermission, User, UserRole


def _fallback_admin(db: Session, company_id, exclude) -> User | None:
    return db.scalar(
        select(User).join(UserRole, UserRole.user_id == User.id)
        .join(RolePermission, RolePermission.role_id == UserRole.role_id)
        .where(User.company_id == company_id, User.id != exclude, User.status == "active",
               RolePermission.permission_code == "settings.manage")
        .limit(1)
    )


def approver_chain(db: Session, cs: CompanySettings, requester: User) -> list[User]:
    chain: list[User] = []
    current = requester
    for _ in range(max(1, cs.approval_levels)):
        mgr = db.get(User, current.manager_id) if current.manager_id else None
        if not mgr or mgr.id == requester.id:
            break
        chain.append(mgr)
        current = mgr
    if not chain:
        admin = _fallback_admin(db, requester.company_id, requester.id)
        if admin:
            chain.append(admin)
    if not chain:
        raise HTTPException(409, "No approver is configured for this employee")
    return chain


def create_chain(db: Session, cs: CompanySettings, request_type: str, request_id, requester: User) -> User:
    chain = approver_chain(db, cs, requester)
    for i, approver in enumerate(chain, start=1):
        db.add(Approval(company_id=requester.company_id, request_type=request_type, request_id=request_id,
                        step_order=i, approver_id=approver.id, status="pending" if i == 1 else "waiting"))
    return chain[0]


def steps(db: Session, request_type: str, request_id) -> list[Approval]:
    return list(db.scalars(select(Approval).where(
        Approval.request_type == request_type, Approval.request_id == request_id).order_by(Approval.step_order)))


def decide(db: Session, *, request_type: str, request_id, requester_id, actor: User, is_admin: bool,
           approve: bool, comment: str | None) -> tuple[str, User | None]:
    """Record a decision. Returns (status, next_approver); status is approved, rejected or pending."""
    if actor.id == requester_id:
        raise HTTPException(403, "You cannot approve your own request")
    all_steps = steps(db, request_type, request_id)
    current = next((s for s in all_steps if s.status == "pending"), None)
    if not current:
        raise HTTPException(409, "This request has already been decided")
    if current.approver_id != actor.id and not is_admin:
        raise HTTPException(403, "You are not the approver for this step")

    current.status = "approved" if approve else "rejected"
    current.decided_at = datetime.now(timezone.utc)
    current.comment = comment if current.approver_id == actor.id else f"[HR override by {actor.name}] {comment or ''}".strip()

    if not approve:
        for s in all_steps:
            if s.status == "waiting":
                s.status = "skipped"
        return "rejected", None
    nxt = next((s for s in all_steps if s.status == "waiting"), None)
    if nxt:
        nxt.status = "pending"
        return "pending", db.get(User, nxt.approver_id)
    return "approved", None


def cancel(db: Session, request_type: str, request_id) -> None:
    for s in steps(db, request_type, request_id):
        if s.status in ("pending", "waiting"):
            s.status = "skipped"


def pending_ids_for(db: Session, request_type: str, approver_id) -> list:
    return list(db.scalars(select(Approval.request_id).where(
        Approval.request_type == request_type, Approval.approver_id == approver_id, Approval.status == "pending")))


def timelines(db: Session, request_type: str, request_ids) -> dict:
    """Batch version of timeline(): {request_id: [steps]} in two queries for any number of requests."""
    request_ids = list(request_ids)
    if not request_ids:
        return {}
    rows = list(db.scalars(select(Approval).where(
        Approval.request_type == request_type, Approval.request_id.in_(request_ids)).order_by(Approval.step_order)))
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_({r.approver_id for r in rows}))).all()) if rows else {}
    out: dict = {rid: [] for rid in request_ids}
    for s in rows:
        out[s.request_id].append({"step": s.step_order, "approver": names.get(s.approver_id), "status": s.status,
                                  "comment": s.comment, "decided_at": s.decided_at})
    return out


def pending_counts(db: Session, approver_id) -> dict:
    """{request_type: number of requests waiting for this approver} in one query."""
    from sqlalchemy import func
    rows = db.execute(select(Approval.request_type, func.count()).where(
        Approval.approver_id == approver_id, Approval.status == "pending").group_by(Approval.request_type)).all()
    return dict(rows)


def timeline(db: Session, request_type: str, request_id) -> list[dict]:
    out = []
    for s in steps(db, request_type, request_id):
        approver = db.get(User, s.approver_id)
        out.append({"step": s.step_order, "approver": approver.name if approver else None,
                    "status": s.status, "comment": s.comment, "decided_at": s.decided_at})
    return out
