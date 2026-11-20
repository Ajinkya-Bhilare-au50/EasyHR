import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit, notify
from ..common import CamelModel, brief, company_settings, ensure_balances, preload_users, resolve_user
from ..db import get_db
from ..deps import Ctx, get_ctx, reportee_ids, require
from ..models import LeaveBalance, LeaveRequest, LeaveType, User
from ..services import approvals
from ..services.attendance import is_payroll_locked, local_today, recalc_day
from ..services.calendar import count_leave_days, daterange

router = APIRouter(prefix="/api/leave", tags=["leave"])


def _balance(db: Session, user_id, type_id, year: int) -> LeaveBalance | None:
    return db.scalar(select(LeaveBalance).where(
        LeaveBalance.user_id == user_id, LeaveBalance.leave_type_id == type_id, LeaveBalance.year == year))


def _req_dict(db: Session, r: LeaveRequest, with_timeline: bool = False) -> dict:
    d = {
        "id": r.id, "user": brief(db.get(User, r.user_id)),
        "leave_type": {"id": r.leave_type.id, "code": r.leave_type.code, "name": r.leave_type.name,
                       "is_paid": r.leave_type.is_paid},
        "from_date": r.from_date, "to_date": r.to_date, "applied_days": float(r.applied_days),
        "actual_days": float(r.actual_days), "reason": r.reason, "description": r.description,
        "backup": brief(db.get(User, r.backup_user_id)), "status": r.status, "created_at": r.created_at,
    }
    if with_timeline:
        d["timeline"] = approvals.timeline(db, "leave", r.id)
    return d


@router.get("/types")
def types(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    year = local_today(cs).year
    ensure_balances(db, ctx.cid, year, [ctx.user.id])
    db.commit()
    out = []
    for t in db.scalars(select(LeaveType).where(LeaveType.active.is_(True)).order_by(LeaveType.name)):
        b = _balance(db, ctx.user.id, t.id, year)
        out.append({"id": t.id, "code": t.code, "name": t.name, "is_paid": t.is_paid,
                    "label": t.name if t.is_paid else f"{t.name} (LWP/LOP)",
                    "yearly_quota": float(t.yearly_quota),
                    "available": float(b.available) if b else 0, "used": float(b.used) if b else 0})
    return {"year": year, "items": out}


class PreviewIn(CamelModel):
    from_date: date
    to_date: date


@router.post("/preview")
def preview(body: PreviewIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    """Applied and actual days, calculated on the server."""
    if body.to_date < body.from_date:
        raise HTTPException(400, "To date must be on or after from date")
    applied, actual = count_leave_days(db, company_settings(db, ctx.cid), body.from_date, body.to_date)
    return {"applied_days": applied, "actual_days": actual}


class LeaveIn(CamelModel):
    leave_type_id: uuid.UUID
    from_date: date
    to_date: date
    reason: str
    description: str | None = None
    backup_user_id: str


@router.post("/requests", status_code=201)
def apply(body: LeaveIn, ctx: Ctx = Depends(require("leave.apply")), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    if body.to_date < body.from_date:
        raise HTTPException(400, "To date must be on or after from date")
    if body.from_date.year != body.to_date.year:
        raise HTTPException(400, "A leave request cannot span two calendar years")
    if not body.reason.strip():
        raise HTTPException(400, "Reason is required")
    if is_payroll_locked(db, cs, body.from_date):
        raise HTTPException(409, "Payroll for this month is locked")
    lt = db.get(LeaveType, body.leave_type_id)
    if not lt or not lt.active:
        raise HTTPException(404, "Leave type not found")
    backup = resolve_user(db, body.backup_user_id)
    if backup.id == ctx.user.id or backup.status != "active":
        raise HTTPException(400, "Choose an active colleague as backup employee")

    overlap = db.scalar(select(LeaveRequest).where(
        LeaveRequest.user_id == ctx.user.id, LeaveRequest.status.in_(["pending", "approved"]),
        LeaveRequest.from_date <= body.to_date, LeaveRequest.to_date >= body.from_date))
    if overlap:
        raise HTTPException(409, "You already have leave applied for some of these dates")

    applied, actual = count_leave_days(db, cs, body.from_date, body.to_date)
    if actual == 0:
        raise HTTPException(400, "Selected dates are all holidays or week-offs")
    if lt.is_paid:
        ensure_balances(db, ctx.cid, body.from_date.year, [ctx.user.id])
        db.flush()
        b = _balance(db, ctx.user.id, lt.id, body.from_date.year)
        pending = sum(float(x.actual_days) for x in db.scalars(select(LeaveRequest).where(
            LeaveRequest.user_id == ctx.user.id, LeaveRequest.leave_type_id == lt.id,
            LeaveRequest.status == "pending")))
        if not b or float(b.available) - pending < actual:
            raise HTTPException(409, f"Insufficient {lt.name} balance")

    r = LeaveRequest(company_id=ctx.cid, user_id=ctx.user.id, leave_type_id=lt.id, from_date=body.from_date,
                     to_date=body.to_date, applied_days=applied, actual_days=actual,
                     reason=body.reason.strip()[:200], description=body.description,
                     backup_user_id=backup.id)
    db.add(r)
    db.flush()
    approver = approvals.create_chain(db, cs, "leave", r.id, ctx.user)
    notify(db, company_id=ctx.cid, user_id=approver.id, kind="warning", title="Leave request",
           body=f"{ctx.user.name} applied for {actual:g} day(s) of {lt.name}.", link="/leaves?tab=approve")
    notify(db, company_id=ctx.cid, user_id=backup.id, title="You are a backup employee",
           body=f"{ctx.user.name} named you as backup from {body.from_date:%d %b} to {body.to_date:%d %b}.")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="leave.applied", entity="leave_request",
          entity_id=r.id, new=_req_dict(db, r))
    db.commit()
    return _req_dict(db, r, True)


@router.get("/requests")
def list_requests(scope: str = "self", status: str | None = None, year: int | None = None,
                  ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    stmt = select(LeaveRequest)
    if scope == "self":
        stmt = stmt.where(LeaveRequest.user_id == ctx.user.id)
    elif scope == "pending":
        ids = approvals.pending_ids_for(db, "leave", ctx.user.id)
        stmt = stmt.where(LeaveRequest.id.in_(ids or [uuid.uuid4()]), LeaveRequest.status == "pending")
    elif scope == "team":
        if not ctx.can("leave.approve"):
            raise HTTPException(403, "You do not have permission for this action")
        if not ctx.can("employees.manage"):
            ids = reportee_ids(db, ctx.user.id)
            stmt = stmt.where(LeaveRequest.user_id.in_(ids or [uuid.uuid4()]))
    else:
        raise HTTPException(400, "scope must be self, pending or team")
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    if year:
        stmt = stmt.where(LeaveRequest.from_date >= date(year, 1, 1), LeaveRequest.from_date <= date(year, 12, 31))
    rows = list(db.scalars(stmt.order_by(LeaveRequest.created_at.desc()).limit(500)))
    # Batch-load people and approval steps: a fixed number of queries however many rows.
    preload_users(db, [x for r in rows for x in (r.user_id, r.backup_user_id)])
    tl = approvals.timelines(db, "leave", [r.id for r in rows])
    return {"items": [{**_req_dict(db, r), "timeline": tl[r.id]} for r in rows]}


class LeaveDecisionIn(CamelModel):
    action: str  # approve / reject / cancel
    comment: str | None = None


def _recalc_range(db, cs, r: LeaveRequest):
    today = local_today(cs)
    for d in daterange(r.from_date, min(r.to_date, today)):
        recalc_day(db, cs, r.user_id, d)


@router.patch("/requests/{rid}")
def decide(rid: uuid.UUID, body: LeaveDecisionIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    r = db.get(LeaveRequest, rid)
    if not r:
        raise HTTPException(404, "Leave request not found")
    cs = company_settings(db, ctx.cid)
    old = _req_dict(db, r)
    b = _balance(db, r.user_id, r.leave_type_id, r.from_date.year)

    if body.action == "cancel":
        if r.user_id != ctx.user.id and not ctx.can("employees.manage"):
            raise HTTPException(403, "Only the applicant can cancel this request")
        if r.status not in ("pending", "approved"):
            raise HTTPException(409, "This request cannot be cancelled")
        if r.status == "approved":
            if r.from_date <= local_today(cs) and not ctx.can("employees.manage"):
                raise HTTPException(409, "Leave that has started can only be cancelled by HR")
            if is_payroll_locked(db, cs, r.from_date):
                raise HTTPException(409, "Payroll for this month is locked")
            if b and r.leave_type.is_paid:
                b.available = float(b.available) + float(r.actual_days)
                b.used = float(b.used) - float(r.actual_days)
            elif b:
                b.used = float(b.used) - float(r.actual_days)
        approvals.cancel(db, "leave", r.id)
        r.status = "cancelled"
        db.flush()
        _recalc_range(db, cs, r)
        audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="leave.cancelled", entity="leave_request",
              entity_id=r.id, old=old, new=_req_dict(db, r))
        db.commit()
        return _req_dict(db, r, True)

    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be approve, reject or cancel")
    if not ctx.can("leave.approve"):
        raise HTTPException(403, "You do not have permission for this action")
    if r.status != "pending":
        raise HTTPException(409, "This request has already been decided")
    approve = body.action == "approve"
    final, nxt = approvals.decide(db, request_type="leave", request_id=r.id, requester_id=r.user_id,
                                  actor=ctx.user, is_admin=ctx.can("employees.manage"), approve=approve,
                                  comment=body.comment)
    if final == "pending" and nxt:
        notify(db, company_id=ctx.cid, user_id=nxt.id, kind="warning", title="Leave request",
               body=f"A leave request from {old['user']['name']} needs your approval.", link="/leaves?tab=approve")
    else:
        if final == "approved":
            if r.leave_type.is_paid:
                if not b or float(b.available) < float(r.actual_days):
                    raise HTTPException(409, "Employee no longer has enough balance")
                b.available = float(b.available) - float(r.actual_days)
            if b:
                b.used = float(b.used) + float(r.actual_days)
        r.status = final
        db.flush()
        if final == "approved":
            _recalc_range(db, cs, r)
        notify(db, company_id=ctx.cid, user_id=r.user_id, kind="success" if approve else "danger",
               title=f"Leave {final}", link="/leaves?tab=history",
               body=f"Your {r.leave_type.name} from {r.from_date:%d %b} to {r.to_date:%d %b} was {final}.")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action=f"leave.{'approved' if approve else 'rejected'}",
          entity="leave_request", entity_id=r.id, old=old, new=_req_dict(db, r))
    db.commit()
    return _req_dict(db, r, True)
