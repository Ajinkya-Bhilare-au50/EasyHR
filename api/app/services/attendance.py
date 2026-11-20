from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from ..models import (
    AttendanceDay, AttendancePunch, CompanySettings, Holiday, HolidayRequest, LeaveRequest,
    PayrollLock, Rationalization,
)


def tz(cs: CompanySettings) -> ZoneInfo:
    return ZoneInfo(cs.timezone or "UTC")


def local_today(cs: CompanySettings) -> date:
    return datetime.now(tz(cs)).date()


def day_bounds(cs: CompanySettings, d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=tz(cs))
    return start, start + timedelta(days=1)


def _non_work_status(db: Session, cs: CompanySettings, user_id, d: date) -> str:
    on_leave = db.scalar(select(func.count()).select_from(LeaveRequest).where(
        LeaveRequest.user_id == user_id, LeaveRequest.status == "approved",
        LeaveRequest.from_date <= d, LeaveRequest.to_date >= d,
    ))
    if on_leave:
        return "L"
    holiday = db.scalar(select(func.count()).select_from(Holiday).where(
        Holiday.company_id == cs.company_id, Holiday.date == d, Holiday.is_optional.is_(False)))
    opt = db.scalar(select(func.count()).select_from(HolidayRequest).join(Holiday).where(
        HolidayRequest.user_id == user_id, HolidayRequest.status == "approved", Holiday.date == d))
    if holiday or opt:
        return "H"
    if d.weekday() in (cs.week_offs or []):
        return "WO"
    return "A"


def non_work_statuses(db: Session, cs: CompanySettings, user_ids, start: date, end: date) -> dict:
    """Batch version of _non_work_status: {(user_id, date): "L" | "H" | "WO" | "A"} for every
    user and day in the range, using 3 queries in total instead of 3 per user per day."""
    user_ids = list(user_ids)
    if not user_ids:
        return {}
    leaves = db.execute(select(LeaveRequest.user_id, LeaveRequest.from_date, LeaveRequest.to_date).where(
        LeaveRequest.user_id.in_(user_ids), LeaveRequest.status == "approved",
        LeaveRequest.from_date <= end, LeaveRequest.to_date >= start)).all()
    holidays = set(db.scalars(select(Holiday.date).where(
        Holiday.company_id == cs.company_id, Holiday.is_optional.is_(False), Holiday.date >= start, Holiday.date <= end)))
    optional = set(db.execute(select(HolidayRequest.user_id, Holiday.date).join(Holiday).where(
        HolidayRequest.user_id.in_(user_ids), HolidayRequest.status == "approved",
        Holiday.date >= start, Holiday.date <= end)).all())
    on_leave = set()
    for uid, f, t in leaves:
        d = max(f, start)
        while d <= min(t, end):
            on_leave.add((uid, d))
            d += timedelta(days=1)
    week_offs = set(cs.week_offs or [])
    out = {}
    for uid in user_ids:
        d = start
        while d <= end:
            if (uid, d) in on_leave:
                out[(uid, d)] = "L"
            elif d in holidays or (uid, d) in optional:
                out[(uid, d)] = "H"
            elif d.weekday() in week_offs:
                out[(uid, d)] = "WO"
            else:
                out[(uid, d)] = "A"
            d += timedelta(days=1)
    return out


def recalc_day(db: Session, cs: CompanySettings, user_id, d: date) -> AttendanceDay:
    start, end = day_bounds(cs, d)
    punches = list(db.scalars(select(AttendancePunch).where(
        AttendancePunch.user_id == user_id,
        AttendancePunch.punch_time >= start, AttendancePunch.punch_time < end,
    ).order_by(AttendancePunch.punch_time)))

    ins = [p.punch_time for p in punches if p.type == "in"]
    outs = [p.punch_time for p in punches if p.type == "out"]
    first = min(ins) if ins else None
    last = max(outs) if outs else None
    hours = round((last - first).total_seconds() / 3600, 2) if first and last and last > first else 0

    status = "P" if ins else _non_work_status(db, cs, user_id, d)

    row = db.scalar(select(AttendanceDay).where(AttendanceDay.user_id == user_id, AttendanceDay.date == d))
    if not row:
        row = AttendanceDay(company_id=cs.company_id, user_id=user_id, date=d)
        db.add(row)
    row.first_punch, row.last_punch, row.total_hours, row.status = first, last, hours, status
    return row


def is_payroll_locked(db: Session, cs: CompanySettings, d: date) -> bool:
    return bool(db.scalar(select(func.count()).select_from(PayrollLock).where(
        PayrollLock.company_id == cs.company_id, PayrollLock.year == d.year, PayrollLock.month == d.month)))


def validate_rationalization(db: Session, cs: CompanySettings, user_id, d: date,
                             check_in: time | None, check_out: time | None) -> None:
    """Server-side business rules (documentation.md section 6.2)."""
    today = local_today(cs)
    if d > today:
        raise HTTPException(400, "Cannot rationalize a future date")
    if (today - d).days > cs.rationalize_window_days:
        raise HTTPException(400, f"Only the last {cs.rationalize_window_days} days can be rationalized")
    if is_payroll_locked(db, cs, d):
        raise HTTPException(409, "Payroll for this month is locked")
    if not check_in and not check_out:
        raise HTTPException(400, "Provide a check-in or check-out time")
    if check_in and check_out and check_out <= check_in:
        raise HTTPException(400, "Check-out must be after check-in")
    month_start = d.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    used = db.scalar(select(func.count()).select_from(Rationalization).where(
        Rationalization.user_id == user_id, Rationalization.status.in_(["pending", "approved"]),
        and_(Rationalization.date >= month_start, Rationalization.date < next_month),
    ))
    if used >= cs.rationalize_monthly_limit:
        raise HTTPException(409, f"Monthly limit of {cs.rationalize_monthly_limit} rationalizations reached")
    dup = db.scalar(select(func.count()).select_from(Rationalization).where(
        Rationalization.user_id == user_id, Rationalization.date == d, Rationalization.status == "pending"))
    if dup:
        raise HTTPException(409, "A pending request already exists for this date")


def apply_rationalization(db: Session, cs: CompanySettings, r: Rationalization) -> AttendanceDay:
    """Add new punches (never edit originals) and recalculate the day."""
    zone = tz(cs)
    for kind, t in (("in", r.check_in), ("out", r.check_out)):
        if t:
            db.add(AttendancePunch(
                company_id=r.company_id, user_id=r.user_id, type=kind, source="rationalized",
                punch_time=datetime.combine(r.date, t, tzinfo=zone), rationalization_id=r.id,
            ))
    db.flush()
    return recalc_day(db, cs, r.user_id, r.date)
