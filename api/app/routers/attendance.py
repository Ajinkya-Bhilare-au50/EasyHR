import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit, notify
from ..common import CamelModel, brief, company_settings, preload_users, resolve_user
from ..db import get_db
from ..deps import Ctx, can_manage_user, get_ctx, reportee_ids, require
from ..models import AttendanceDay, AttendancePunch, Rationalization, User
from ..services import approvals
from ..services.attendance import (
    apply_rationalization, non_work_statuses, day_bounds, local_today, recalc_day, tz,
    validate_rationalization,
)
from ..services.calendar import daterange

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _target_user(db: Session, ctx: Ctx, user_ref: str | None) -> User:
    """Self, or a reportee when the caller may view team attendance."""
    if not user_ref or user_ref in ("me", str(ctx.user.id), ctx.user.employee_code):
        if not ctx.can("attendance.view.self"):
            raise HTTPException(403, "You do not have permission for this action")
        return ctx.user
    if not ctx.can("attendance.view.team"):
        raise HTTPException(403, "You can only view your own attendance")
    target = resolve_user(db, user_ref)
    if not can_manage_user(db, ctx, target.id):
        raise HTTPException(403, "This employee is not in your team")
    return target


def _range(cs, from_: date | None, to: date | None) -> tuple[date, date]:
    today = local_today(cs)
    to = to or today
    from_ = from_ or to.replace(day=1)
    if from_ > to:
        raise HTTPException(400, "From date must be before to date")
    if (to - from_).days > 366:
        raise HTTPException(400, "Date range cannot exceed one year")
    return from_, to


# --------------------------------------------------------------------------- punch


class PunchIn(CamelModel):
    type: str | None = None  # in / out; toggles automatically when omitted
    location: str | None = "WFO"
    source: str = "web"


def _today_state(db: Session, cs, user_id) -> dict:
    today = local_today(cs)
    start, end = day_bounds(cs, today)
    punches = list(db.scalars(select(AttendancePunch).where(
        AttendancePunch.user_id == user_id, AttendancePunch.punch_time >= start,
        AttendancePunch.punch_time < end).order_by(AttendancePunch.punch_time)))
    first_in = next((p.punch_time for p in punches if p.type == "in"), None)
    last = punches[-1] if punches else None
    checked_in = bool(last and last.type == "in")
    worked = 0.0
    open_in = None
    for p in punches:
        if p.type == "in" and open_in is None:
            open_in = p.punch_time
        elif p.type == "out" and open_in is not None:
            worked += (p.punch_time - open_in).total_seconds()
            open_in = None
    return {
        "date": today, "checked_in": checked_in, "first_in": first_in,
        "last_out": next((p.punch_time for p in reversed(punches) if p.type == "out"), None),
        "worked_seconds": int(worked), "open_since": open_in,
        "shift_start": cs.shift_start, "shift_end": cs.shift_end, "timezone": cs.timezone,
        "punches": [{"time": p.punch_time, "type": p.type, "source": p.source, "location": p.location} for p in punches],
        "server_time": datetime.now(timezone.utc),
    }


@router.get("/today")
def today(ctx: Ctx = Depends(require("attendance.checkin")), db: Session = Depends(get_db)):
    return _today_state(db, company_settings(db, ctx.cid), ctx.user.id)


@router.post("/punch")
def punch(body: PunchIn, ctx: Ctx = Depends(require("attendance.checkin")), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    state = _today_state(db, cs, ctx.user.id)
    kind = body.type or ("out" if state["checked_in"] else "in")
    if kind not in ("in", "out"):
        raise HTTPException(400, "type must be in or out")
    if kind == "in" and state["checked_in"]:
        raise HTTPException(409, "You are already checked in")
    if kind == "out" and not state["checked_in"]:
        raise HTTPException(409, "You are not checked in")
    source = body.source if body.source in ("web", "mobile") else "web"
    # Server time only; client time is never trusted.
    db.add(AttendancePunch(company_id=ctx.cid, user_id=ctx.user.id, type=kind, source=source,
                           location=(body.location or "WFO")[:120], punch_time=datetime.now(timezone.utc)))
    db.flush()
    recalc_day(db, cs, ctx.user.id, local_today(cs))
    db.commit()
    return _today_state(db, cs, ctx.user.id)


# --------------------------------------------------------------------------- summaries


def _day_dict(cs, d: date, row: AttendanceDay | None, status: str | None = None) -> dict:
    return {
        "date": d, "weekday": d.strftime("%a"),
        "first_punch": row.first_punch if row else None, "last_punch": row.last_punch if row else None,
        "total_hours": float(row.total_hours) if row else 0.0,
        "status": status,
    }


@router.get("")
def summary(user_id: str | None = Query(None, alias="userId"), from_: date | None = Query(None, alias="from"),
            to: date | None = None, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    """Daily summary (My attendance / Attendance data)."""
    cs = company_settings(db, ctx.cid)
    user = _target_user(db, ctx, user_id)
    from_, to = _range(cs, from_, to)
    today = local_today(cs)
    rows = {r.date: r for r in db.scalars(select(AttendanceDay).where(
        AttendanceDay.user_id == user.id, AttendanceDay.date >= from_, AttendanceDay.date <= to))}
    days = []
    # Leave, holiday and week-off status can change after the day row was written, so it is
    # recomputed, in one batch for the whole range.
    non_work = non_work_statuses(db, cs, [user.id], from_, min(to, today))
    for d in daterange(from_, min(to, today)):
        r = rows.get(d)
        if r and r.status == "P":
            status = "P"
        else:
            status = non_work[(user.id, d)]
            if d == today and status == "A":
                status = "NM"  # not marked yet today
        days.append(_day_dict(cs, d, r, status))
    days.reverse()
    counts: dict[str, int] = {}
    for d in days:
        if d["status"]:
            counts[d["status"]] = counts.get(d["status"], 0) + 1
    hours = [d["total_hours"] for d in days if d["total_hours"]]
    return {
        "user": brief(user), "from": from_, "to": to, "days": days, "counts": counts,
        "average_hours": round(sum(hours) / len(hours), 2) if hours else 0,
    }


@router.get("/raw")
def raw(user_id: str | None = Query(None, alias="userId"), from_: date | None = Query(None, alias="from"),
        to: date | None = None, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    user = _target_user(db, ctx, user_id)
    from_, to = _range(cs, from_, to)
    start, _ = day_bounds(cs, from_)
    _, end = day_bounds(cs, to)
    punches = db.scalars(select(AttendancePunch).where(
        AttendancePunch.user_id == user.id, AttendancePunch.punch_time >= start,
        AttendancePunch.punch_time < end).order_by(AttendancePunch.punch_time.desc()))
    zone = tz(cs)
    return {"user": brief(user), "items": [
        {"id": p.id, "date": p.punch_time.astimezone(zone).date(), "time": p.punch_time, "type": p.type,
         "source": p.source, "location": p.location} for p in punches]}


@router.get("/daily-status")
def daily_status(day: date | None = Query(None, alias="date"), q: str | None = None,
                 ctx: Ctx = Depends(require("attendance.view.team")), db: Session = Depends(get_db)):
    """Team status for one day (Daily status tab)."""
    cs = company_settings(db, ctx.cid)
    day = day or local_today(cs)
    if ctx.can("employees.manage"):
        users = list(db.scalars(select(User).where(User.status == "active", User.is_master_admin.is_(False))
                                .order_by(User.name)))
    else:
        ids = reportee_ids(db, ctx.user.id)
        users = list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.name))) if ids else []
    if q:
        ql = q.lower()
        users = [u for u in users if ql in u.name.lower() or ql in (u.employee_code or "").lower()]
    rows = {r.user_id: r for r in db.scalars(select(AttendanceDay).where(
        AttendanceDay.date == day, AttendanceDay.user_id.in_([u.id for u in users])))} if users else {}
    items, counts = [], {}
    non_work = non_work_statuses(db, cs, [u.id for u in users], day, day)
    for u in users:
        r = rows.get(u.id)
        status = r.status if r and r.status == "P" else non_work[(u.id, day)]
        if day == local_today(cs) and status == "A":
            status = "NM"  # not marked yet
        counts[status] = counts.get(status, 0) + 1
        items.append({"user": brief(u), "first_punch": r.first_punch if r else None,
                      "last_punch": r.last_punch if r else None,
                      "total_hours": float(r.total_hours) if r else 0, "status": status})
    return {"date": day, "items": items, "counts": counts}


# --------------------------------------------------------------------------- rationalize


class RationalizeIn(CamelModel):
    user_id: str | None = None
    date: date
    check_in: time | None = None
    check_out: time | None = None
    reason: str


class DecisionIn(CamelModel):
    action: str  # approve / reject
    comment: str | None = None


def _rat_dict(db: Session, r: Rationalization) -> dict:
    return {
        "id": r.id, "user": brief(db.get(User, r.user_id)), "date": r.date, "check_in": r.check_in,
        "check_out": r.check_out, "reason": r.reason, "status": r.status,
        "requested_by": brief(db.get(User, r.requested_by)),
        "decided_by": brief(db.get(User, r.decided_by)) if r.decided_by else None,
        "requested_at": r.requested_at, "decided_at": r.decided_at, "decision_comment": r.decision_comment,
        "direct": r.requested_by != r.user_id,
    }


@router.post("/rationalizations", status_code=201)
def create_rationalization(body: RationalizeIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(400, "Reason is required")
    target = resolve_user(db, body.user_id) if body.user_id else ctx.user
    direct = target.id != ctx.user.id

    if direct:
        # Flow B: manager rationalizes a reportee directly; approved immediately.
        if not ctx.can("attendance.rationalize.direct"):
            raise HTTPException(403, "You do not have permission to rationalize others")
        if not can_manage_user(db, ctx, target.id):
            raise HTTPException(403, "You can only rationalize your direct or indirect reportees")
    elif not ctx.can("attendance.rationalize.request"):
        raise HTTPException(403, "You do not have permission to request rationalization")

    validate_rationalization(db, cs, target.id, body.date, body.check_in, body.check_out)
    now = datetime.now(timezone.utc)
    r = Rationalization(company_id=ctx.cid, user_id=target.id, date=body.date, check_in=body.check_in,
                        check_out=body.check_out, reason=reason[:500], requested_by=ctx.user.id,
                        requested_at=now)
    db.add(r)
    db.flush()

    if direct or not cs.rationalize_requires_approval:
        r.status, r.decided_by, r.decided_at = "approved", ctx.user.id, now
        day = apply_rationalization(db, cs, r)
        audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="rationalization.approved",
              entity="rationalization", entity_id=r.id, new=_rat_dict(db, r))
        if direct:
            notify(db, company_id=ctx.cid, user_id=target.id, kind="success",
                   title="Attendance rationalized",
                   body=f"{ctx.user.name} corrected your attendance for {body.date:%d %b %Y} ({day.status}).",
                   link="/attendance?tab=history")
    else:
        approver = approvals.create_chain(db, cs, "rationalization", r.id, ctx.user)
        audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="rationalization.requested",
              entity="rationalization", entity_id=r.id, new=_rat_dict(db, r))
        notify(db, company_id=ctx.cid, user_id=approver.id, kind="warning",
               title="Rationalization request", link="/attendance?tab=approve",
               body=f"{ctx.user.name} requested a correction for {body.date:%d %b %Y}.")
    db.commit()
    return _rat_dict(db, r)


@router.get("/rationalizations")
def list_rationalizations(
    user_id: str | None = Query(None, alias="userId"), from_: date | None = Query(None, alias="from"),
    to: date | None = None, scope: str = "team", status: str | None = None,
    ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db),
):
    stmt = select(Rationalization)
    if scope == "self":
        stmt = stmt.where(Rationalization.user_id == ctx.user.id)
    elif scope == "pending":
        ids = approvals.pending_ids_for(db, "rationalization", ctx.user.id)
        stmt = stmt.where(Rationalization.id.in_(ids or [uuid.uuid4()]), Rationalization.status == "pending")
    else:
        if not ctx.can("attendance.view.team"):
            raise HTTPException(403, "You do not have permission for this action")
        if user_id:
            target = resolve_user(db, user_id)
            if not can_manage_user(db, ctx, target.id):
                raise HTTPException(403, "This employee is not in your team")
            stmt = stmt.where(Rationalization.user_id == target.id)
        elif not ctx.can("employees.manage"):
            ids = reportee_ids(db, ctx.user.id)
            stmt = stmt.where(Rationalization.user_id.in_(ids or [uuid.uuid4()]))
    if from_:
        stmt = stmt.where(Rationalization.date >= from_)
    if to:
        stmt = stmt.where(Rationalization.date <= to)
    if status:
        stmt = stmt.where(Rationalization.status == status)
    rows = list(db.scalars(stmt.order_by(Rationalization.requested_at.desc()).limit(1000)))
    preload_users(db, [x for r in rows for x in (r.user_id, r.requested_by, r.decided_by)])
    return {"items": [_rat_dict(db, r) for r in rows]}


@router.patch("/rationalizations/{rid}")
def decide_rationalization(rid: uuid.UUID, body: DecisionIn,
                           ctx: Ctx = Depends(require("attendance.rationalize.approve")),
                           db: Session = Depends(get_db)):
    r = db.get(Rationalization, rid)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "pending":
        raise HTTPException(409, "This request has already been decided")
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be approve or reject")
    cs = company_settings(db, ctx.cid)
    approve = body.action == "approve"
    if approve:
        from ..services.attendance import is_payroll_locked
        if is_payroll_locked(db, cs, r.date):
            raise HTTPException(409, "Payroll for this month is locked")
    old = _rat_dict(db, r)
    final, nxt = approvals.decide(db, request_type="rationalization", request_id=r.id, requester_id=r.user_id,
                                  actor=ctx.user, is_admin=ctx.can("employees.manage"), approve=approve,
                                  comment=body.comment)
    if final == "pending" and nxt:
        notify(db, company_id=ctx.cid, user_id=nxt.id, kind="warning", title="Rationalization request",
               body=f"A correction for {r.date:%d %b %Y} needs your approval.", link="/attendance?tab=approve")
    else:
        r.status, r.decided_by, r.decided_at = final, ctx.user.id, datetime.now(timezone.utc)
        r.decision_comment = body.comment
        msg = f"Your attendance correction for {r.date:%d %b %Y} was {final}."
        if final == "approved":
            day = apply_rationalization(db, cs, r)
            msg += f" Status is now {day.status}."
        notify(db, company_id=ctx.cid, user_id=r.user_id, kind="success" if approve else "danger",
               title=f"Rationalization {final}", body=msg, link="/attendance?tab=history")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action=f"rationalization.{'approved' if approve else 'rejected'}",
          entity="rationalization", entity_id=r.id, old=old, new=_rat_dict(db, r))
    db.commit()
    return _rat_dict(db, r)


@router.get("/rationalizations/usage")
def rationalization_usage(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    today = local_today(cs)
    used = db.scalar(select(func.count()).select_from(Rationalization).where(
        Rationalization.user_id == ctx.user.id, Rationalization.status.in_(["pending", "approved"]),
        Rationalization.date >= today.replace(day=1)))
    return {"used": used, "limit": cs.rationalize_monthly_limit, "window_days": cs.rationalize_window_days,
            "earliest_date": today - timedelta(days=cs.rationalize_window_days),
            "requires_approval": cs.rationalize_requires_approval}
