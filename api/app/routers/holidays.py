import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit, notify
from ..common import CamelModel, brief, company_settings, preload_users, resolve_user
from ..db import get_db
from ..deps import Ctx, get_ctx, reportee_ids, require
from ..models import Holiday, HolidayRequest, User
from ..services import approvals
from ..services.attendance import local_today, recalc_day

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


def _hol(h: Holiday) -> dict:
    return {"id": h.id, "name": h.name, "date": h.date, "is_optional": h.is_optional, "weekday": h.date.strftime("%A")}


def _req(db: Session, r: HolidayRequest, timeline: bool = True) -> dict:
    d = {"id": r.id, "user": brief(db.get(User, r.user_id)), "holiday": _hol(r.holiday),
         "backup": brief(db.get(User, r.backup_user_id)), "comment": r.comment, "status": r.status,
         "created_at": r.created_at}
    if timeline:
        d["timeline"] = approvals.timeline(db, "holiday", r.id)
    return d


def _taken(db: Session, user_id, year: int) -> int:
    return db.scalar(select(func.count()).select_from(HolidayRequest).join(Holiday).where(
        HolidayRequest.user_id == user_id, HolidayRequest.status.in_(["pending", "approved"]),
        Holiday.date >= date(year, 1, 1), Holiday.date <= date(year, 12, 31))) or 0


@router.get("")
def list_holidays(year: int | None = None, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    year = year or local_today(cs).year
    rows = db.scalars(select(Holiday).where(Holiday.date >= date(year, 1, 1), Holiday.date <= date(year, 12, 31))
                      .order_by(Holiday.date))
    mine = {r.holiday_id: r.status for r in db.scalars(select(HolidayRequest).where(
        HolidayRequest.user_id == ctx.user.id, HolidayRequest.status.in_(["pending", "approved"])))}
    return {"year": year, "optional_quota": cs.optional_holidays_per_year, "optional_used": _taken(db, ctx.user.id, year),
            "items": [{**_hol(h), "my_status": mine.get(h.id)} for h in rows]}


class HolidayApplyIn(CamelModel):
    holiday_id: uuid.UUID
    backup_user_id: str
    comment: str | None = None


@router.post("/requests", status_code=201)
def apply(body: HolidayApplyIn, ctx: Ctx = Depends(require("holiday.apply")), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    h = db.get(Holiday, body.holiday_id)
    if not h or not h.is_optional:
        raise HTTPException(404, "Optional holiday not found")
    if h.date < local_today(cs):
        raise HTTPException(400, "This holiday has already passed")
    backup = resolve_user(db, body.backup_user_id)
    if backup.id == ctx.user.id or backup.status != "active":
        raise HTTPException(400, "Choose an active colleague as backup employee")
    if db.scalar(select(HolidayRequest).where(HolidayRequest.user_id == ctx.user.id, HolidayRequest.holiday_id == h.id,
                                              HolidayRequest.status.in_(["pending", "approved"]))):
        raise HTTPException(409, "You have already applied for this holiday")
    if _taken(db, ctx.user.id, h.date.year) >= cs.optional_holidays_per_year:
        raise HTTPException(409, f"You can take {cs.optional_holidays_per_year} optional holidays per year")

    r = HolidayRequest(company_id=ctx.cid, user_id=ctx.user.id, holiday_id=h.id, backup_user_id=backup.id,
                       comment=body.comment)
    db.add(r)
    db.flush()
    db.refresh(r)
    approver = approvals.create_chain(db, cs, "holiday", r.id, ctx.user)
    notify(db, company_id=ctx.cid, user_id=approver.id, kind="warning", title="Optional holiday request",
           body=f"{ctx.user.name} applied for {h.name} ({h.date:%d %b}).", link="/holiday?tab=approval")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="holiday.applied", entity="holiday_request",
          entity_id=r.id, new=_req(db, r, False))
    db.commit()
    return _req(db, r)


@router.get("/requests")
def list_requests(scope: str = "self", status: str | None = None, ctx: Ctx = Depends(get_ctx),
                  db: Session = Depends(get_db)):
    stmt = select(HolidayRequest)
    if scope == "self":
        stmt = stmt.where(HolidayRequest.user_id == ctx.user.id)
    elif scope == "pending":
        ids = approvals.pending_ids_for(db, "holiday", ctx.user.id)
        stmt = stmt.where(HolidayRequest.id.in_(ids or [uuid.uuid4()]), HolidayRequest.status == "pending")
    elif scope == "team":
        if not ctx.can("holiday.approve"):
            raise HTTPException(403, "You do not have permission for this action")
        if not ctx.can("employees.manage"):
            ids = reportee_ids(db, ctx.user.id)
            stmt = stmt.where(HolidayRequest.user_id.in_(ids or [uuid.uuid4()]))
    else:
        raise HTTPException(400, "scope must be self, pending or team")
    if status:
        stmt = stmt.where(HolidayRequest.status == status)
    rows = list(db.scalars(stmt.order_by(HolidayRequest.created_at.desc()).limit(500)))
    preload_users(db, [x for r in rows for x in (r.user_id, r.backup_user_id)])
    tl = approvals.timelines(db, "holiday", [r.id for r in rows])
    return {"items": [{**_req(db, r, timeline=False), "timeline": tl[r.id]} for r in rows]}


class DecisionIn(CamelModel):
    action: str  # approve / reject / cancel
    comment: str | None = None


@router.patch("/requests/{rid}")
def decide(rid: uuid.UUID, body: DecisionIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    r = db.get(HolidayRequest, rid)
    if not r:
        raise HTTPException(404, "Request not found")
    cs = company_settings(db, ctx.cid)
    old = _req(db, r, False)
    if body.action == "cancel":
        if r.user_id != ctx.user.id:
            raise HTTPException(403, "Only the applicant can cancel this request")
        if r.status not in ("pending", "approved") or r.holiday.date <= local_today(cs):
            raise HTTPException(409, "This request cannot be cancelled")
        approvals.cancel(db, "holiday", r.id)
        r.status = "cancelled"
        audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="holiday.cancelled", entity="holiday_request",
              entity_id=r.id, old=old, new=_req(db, r, False))
        db.commit()
        return _req(db, r)

    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be approve, reject or cancel")
    if not ctx.can("holiday.approve"):
        raise HTTPException(403, "You do not have permission for this action")
    if r.status != "pending":
        raise HTTPException(409, "This request has already been decided")
    approve = body.action == "approve"
    final, nxt = approvals.decide(db, request_type="holiday", request_id=r.id, requester_id=r.user_id,
                                  actor=ctx.user, is_admin=ctx.can("employees.manage"), approve=approve,
                                  comment=body.comment)
    if final == "pending" and nxt:
        notify(db, company_id=ctx.cid, user_id=nxt.id, kind="warning", title="Optional holiday request",
               body=f"A request from {old['user']['name']} needs your approval.", link="/holiday?tab=approval")
    else:
        r.status = final
        db.flush()
        if final == "approved" and r.holiday.date <= local_today(cs):
            recalc_day(db, cs, r.user_id, r.holiday.date)
        notify(db, company_id=ctx.cid, user_id=r.user_id, kind="success" if approve else "danger",
               title=f"Optional holiday {final}", body=f"Your request for {r.holiday.name} was {final}.",
               link="/holiday?tab=apply")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action=f"holiday.{'approved' if approve else 'rejected'}",
          entity="holiday_request", entity_id=r.id, old=old, new=_req(db, r, False))
    db.commit()
    return _req(db, r)


@router.get("/reports")
def reports(year: int | None = None, ctx: Ctx = Depends(require("holiday.reports")), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    year = year or local_today(cs).year
    if ctx.can("employees.manage"):
        users = list(db.scalars(select(User).where(User.status == "active", User.is_master_admin.is_(False))))
    else:
        ids = reportee_ids(db, ctx.user.id)
        users = list(db.scalars(select(User).where(User.id.in_(ids)))) if ids else []
    uids = [u.id for u in users]
    reqs = list(db.scalars(select(HolidayRequest).join(Holiday).where(
        HolidayRequest.user_id.in_(uids or [uuid.uuid4()]),
        Holiday.date >= date(year, 1, 1), Holiday.date <= date(year, 12, 31)))) if uids else []
    per_user = []
    for u in sorted(users, key=lambda x: x.name):
        mine = [r for r in reqs if r.user_id == u.id]
        per_user.append({"user": brief(u), "approved": sum(r.status == "approved" for r in mine),
                         "pending": sum(r.status == "pending" for r in mine),
                         "rejected": sum(r.status == "rejected" for r in mine),
                         "remaining": max(cs.optional_holidays_per_year - sum(r.status in ("approved", "pending") for r in mine), 0)})
    per_holiday = []
    for h in db.scalars(select(Holiday).where(Holiday.is_optional.is_(True), Holiday.date >= date(year, 1, 1),
                                              Holiday.date <= date(year, 12, 31)).order_by(Holiday.date)):
        hr = [r for r in reqs if r.holiday_id == h.id]
        per_holiday.append({"holiday": _hol(h), "approved": sum(r.status == "approved" for r in hr),
                            "pending": sum(r.status == "pending" for r in hr)})
    return {"year": year, "quota": cs.optional_holidays_per_year, "per_user": per_user, "per_holiday": per_holiday}
