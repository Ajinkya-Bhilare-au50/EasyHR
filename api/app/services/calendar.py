from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CompanySettings, Holiday


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def mandatory_holidays(db: Session, company_id, start: date, end: date) -> dict[date, str]:
    rows = db.scalars(select(Holiday).where(
        Holiday.company_id == company_id, Holiday.is_optional.is_(False),
        Holiday.date >= start, Holiday.date <= end,
    ))
    return {h.date: h.name for h in rows}


def count_leave_days(db: Session, cs: CompanySettings, start: date, end: date) -> tuple[float, float]:
    """Applied days (calendar) and actual days (excluding holidays and week-offs)."""
    hol = mandatory_holidays(db, cs.company_id, start, end)
    applied = actual = 0
    for d in daterange(start, end):
        applied += 1
        if d.weekday() not in (cs.week_offs or []) and d not in hol:
            actual += 1
    return float(applied), float(actual)
