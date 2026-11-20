import json
import uuid
from datetime import date

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import CompanySettings, LeaveBalance, LeaveType, User


class CamelModel(BaseModel):
    """Request bodies accept camelCase (userId, checkIn) as in the API docs."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _camelize(obj):
    if isinstance(obj, dict):
        return {(to_camel(k) if isinstance(k, str) and "_" in k else k): _camelize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_camelize(v) for v in obj]
    return obj


class CamelJSONResponse(JSONResponse):
    """Handlers return snake_case dicts; clients always receive camelCase JSON."""

    def render(self, content) -> bytes:
        return json.dumps(_camelize(content), ensure_ascii=False, separators=(",", ":"), default=str).encode()


def company_settings(db: Session, company_id) -> CompanySettings:
    cs = db.get(CompanySettings, company_id)
    if not cs:
        cs = CompanySettings(company_id=company_id)
        db.add(cs)
        db.flush()
    return cs


def resolve_user(db: Session, ref: str | uuid.UUID) -> User:
    """Find a user in the current company by id or employee code (e.g. "2140")."""
    if isinstance(ref, uuid.UUID):
        user = db.get(User, ref)
    else:
        try:
            user = db.scalar(select(User).where(User.id == uuid.UUID(str(ref))))
        except ValueError:
            user = db.scalar(select(User).where(User.employee_code == str(ref)))
    if not user:
        raise HTTPException(404, "Employee not found")
    return user


def preload_users(db: Session, ids) -> None:
    """Load many users in one query so later db.get(User, id) calls hit the identity map
    instead of issuing one query each (avoids N+1 when building lists)."""
    ids = {i for i in ids if i is not None}
    if ids:
        # The identity map holds objects weakly; keep strong refs until the session closes.
        db.info.setdefault("_preloaded", []).extend(db.scalars(select(User).where(User.id.in_(ids))).all())


def initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return "".join(p[0] for p in parts[:2]).upper()


def brief(u: User | None) -> dict | None:
    if not u:
        return None
    return {
        "id": u.id, "name": u.name, "employee_code": u.employee_code, "email": u.email,
        "designation": u.designation, "department": u.department, "initials": initials(u.name),
    }


def tenure(joined: date | None, today: date | None = None) -> str | None:
    if not joined:
        return None
    today = today or date.today()
    months = (today.year - joined.year) * 12 + today.month - joined.month - (today.day < joined.day)
    y, m = divmod(max(months, 0), 12)
    return f"{y}y {m}m" if y else f"{m}m"


def ensure_balances(db: Session, company_id, year: int, user_ids: list | None = None) -> None:
    """Create missing leave balances for the year (quota + carry forward from last year)."""
    types = list(db.scalars(select(LeaveType).where(LeaveType.company_id == company_id, LeaveType.active.is_(True))))
    if user_ids is None:
        user_ids = list(db.scalars(select(User.id).where(User.company_id == company_id, User.status == "active")))
    existing = {(b.user_id, b.leave_type_id) for b in db.scalars(select(LeaveBalance).where(
        LeaveBalance.company_id == company_id, LeaveBalance.year == year))}
    prev = {(b.user_id, b.leave_type_id): b for b in db.scalars(select(LeaveBalance).where(
        LeaveBalance.company_id == company_id, LeaveBalance.year == year - 1))}
    for uid in user_ids:
        for t in types:
            if (uid, t.id) in existing:
                continue
            carry = 0.0
            if (uid, t.id) in prev and t.carry_forward_max:
                carry = min(float(prev[(uid, t.id)].available), float(t.carry_forward_max))
            db.add(LeaveBalance(company_id=company_id, user_id=uid, leave_type_id=t.id, year=year,
                                available=float(t.yearly_quota) + carry if t.is_paid else 0, used=0))


def search_filter(q: str | None):
    if not q:
        return None
    like = f"%{q.strip()}%"
    return or_(User.name.ilike(like), User.employee_code.ilike(like), User.email.ilike(like))
