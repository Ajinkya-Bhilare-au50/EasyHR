"""Company admin / HR APIs (documentation.md section 7.5)."""

import uuid
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..audit import audit
from ..common import CamelModel, brief, company_settings, ensure_balances, resolve_user, search_filter, tenure
from ..db import get_db
from ..deps import Ctx, require
from ..models import (
    AuditLog, Compensation, Holiday, LeaveType, PayrollLock, Permission, Role, RolePermission, User, UserRole,
)
from ..permissions import PERMISSIONS
from ..security import hash_password

router = APIRouter(prefix="/api/admin", tags=["company admin"])
settings_perm = require("settings.manage")
employees_perm = require("employees.manage")


# --------------------------------------------------------------------------- settings


class SettingsIn(CamelModel):
    shift_start: time
    shift_end: time
    timezone: str
    rationalize_window_days: int
    rationalize_monthly_limit: int
    rationalize_requires_approval: bool
    payroll_lock_day: int
    optional_holidays_per_year: int
    approval_levels: int
    week_offs: list[int]


def _settings_dict(cs) -> dict:
    return {k: getattr(cs, k) for k in SettingsIn.model_fields} | {"enabled_modules": cs.enabled_modules}


@router.get("/settings")
def get_settings(ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    return _settings_dict(company_settings(db, ctx.cid))


@router.put("/settings")
def put_settings(body: SettingsIn, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    from zoneinfo import ZoneInfo
    try:
        ZoneInfo(body.timezone)
    except Exception:
        raise HTTPException(400, "Unknown timezone")
    if not (0 <= body.rationalize_window_days <= 90 and 0 <= body.rationalize_monthly_limit <= 31
            and 1 <= body.payroll_lock_day <= 28 and 1 <= body.approval_levels <= 3
            and all(0 <= d <= 6 for d in body.week_offs)):
        raise HTTPException(400, "One or more values are out of range")
    cs = company_settings(db, ctx.cid)
    old = _settings_dict(cs)
    for k, v in body.model_dump().items():
        setattr(cs, k, v)
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="settings.updated", entity="company_settings",
          old=old, new=_settings_dict(cs))
    db.commit()
    return _settings_dict(cs)


# --------------------------------------------------------------------------- employees

PROFILE_FIELDS = ["designation", "department", "division", "region", "branch", "grade", "business_segment",
                  "business_vertical", "product", "cost_centre", "gender", "phone", "blood_group", "address"]


class EmployeeIn(CamelModel):
    employee_code: str
    name: str
    email: EmailStr
    password: str | None = None
    manager_id: str | None = None
    role_ids: list[uuid.UUID] = []
    joined_on: date | None = None
    date_of_birth: date | None = None
    designation: str | None = None
    department: str | None = None
    division: str | None = None
    region: str | None = None
    branch: str | None = None
    grade: str | None = None
    business_segment: str | None = None
    business_vertical: str | None = None
    product: str | None = None
    cost_centre: str | None = None
    gender: str | None = None
    phone: str | None = None
    blood_group: str | None = None
    address: str | None = None
    status: str = "active"
    annual_ctc: float | None = None


def _emp_dict(db: Session, u: User) -> dict:
    return {**brief(u), "manager": brief(u.manager), "roles": [{"id": r.id, "name": r.name} for r in u.roles],
            "status": u.status, "joined_on": u.joined_on, "date_of_birth": u.date_of_birth, "tenure": tenure(u.joined_on),
            **{f: getattr(u, f) for f in PROFILE_FIELDS}}


def _would_cycle(db: Session, user_id, manager_id) -> bool:
    m = manager_id
    seen = set()
    while m and m not in seen:
        if m == user_id:
            return True
        seen.add(m)
        mgr = db.get(User, m)
        m = mgr.manager_id if mgr else None
    return False


def _apply(db: Session, ctx: Ctx, u: User, body: EmployeeIn):
    u.employee_code, u.name, u.email = body.employee_code.strip(), body.name.strip(), str(body.email).lower()
    u.joined_on, u.date_of_birth, u.status = body.joined_on, body.date_of_birth, body.status
    for f in PROFILE_FIELDS:
        setattr(u, f, getattr(body, f))
    if body.manager_id:
        mgr = resolve_user(db, body.manager_id)
        if u.id and _would_cycle(db, u.id, mgr.id):
            raise HTTPException(400, "This manager would create a reporting loop")
        u.manager_id = mgr.id
    else:
        u.manager_id = None
    roles = list(db.scalars(select(Role).where(Role.id.in_(body.role_ids)))) if body.role_ids else []
    if not roles:
        roles = list(db.scalars(select(Role).where(Role.name == "Employee", Role.company_id.is_(None))))
    u.roles = roles


@router.get("/employees")
def list_employees(q: str | None = None, status: str | None = None, ctx: Ctx = Depends(employees_perm),
                   db: Session = Depends(get_db)):
    stmt = select(User).where(User.is_master_admin.is_(False))
    f = search_filter(q)
    if f is not None:
        stmt = stmt.where(f)
    if status:
        stmt = stmt.where(User.status == status)
    users = list(db.scalars(stmt.options(selectinload(User.roles), selectinload(User.manager)).order_by(User.name)))
    return {"items": [_emp_dict(db, u) for u in users]}


@router.get("/employees/{uid}")
def get_employee(uid: uuid.UUID, ctx: Ctx = Depends(employees_perm), db: Session = Depends(get_db)):
    u = resolve_user(db, uid)
    return _emp_dict(db, u)


@router.post("/employees", status_code=201)
def create_employee(body: EmployeeIn, ctx: Ctx = Depends(employees_perm), db: Session = Depends(get_db)):
    if not body.password or len(body.password) < 8:
        raise HTTPException(400, "Initial password must be at least 8 characters")
    if db.scalar(select(func.count()).select_from(User).where(
            (User.employee_code == body.employee_code) | (func.lower(User.email) == str(body.email).lower()))):
        raise HTTPException(409, "Employee code or email already exists")
    u = User(company_id=ctx.cid, password_hash=hash_password(body.password), name="", email="")
    _apply(db, ctx, u, body)
    db.add(u)
    db.flush()
    if body.annual_ctc:
        db.add(Compensation(company_id=ctx.cid, user_id=u.id, effective_from=body.joined_on or date.today(),
                            annual_ctc=body.annual_ctc, components={}))
    ensure_balances(db, ctx.cid, date.today().year, [u.id])
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="employee.created", entity="user", entity_id=u.id,
          new=_emp_dict(db, u))
    db.commit()
    return _emp_dict(db, u)


@router.put("/employees/{uid}")
def update_employee(uid: uuid.UUID, body: EmployeeIn, ctx: Ctx = Depends(employees_perm), db: Session = Depends(get_db)):
    u = resolve_user(db, uid)
    clash = db.scalar(select(func.count()).select_from(User).where(
        User.id != u.id, (User.employee_code == body.employee_code) | (func.lower(User.email) == str(body.email).lower())))
    if clash:
        raise HTTPException(409, "Employee code or email already exists")
    if u.id == ctx.user.id and body.status != "active":
        raise HTTPException(400, "You cannot deactivate yourself")
    old = _emp_dict(db, u)
    _apply(db, ctx, u, body)
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        u.password_hash = hash_password(body.password)
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="employee.updated", entity="user", entity_id=u.id,
          old=old, new=_emp_dict(db, u))
    db.commit()
    return _emp_dict(db, u)


# --------------------------------------------------------------------------- roles


class RoleIn(CamelModel):
    name: str
    permissions: list[str]


def _role_dict(db: Session, r: Role) -> dict:
    members = db.scalar(select(func.count()).select_from(UserRole).join(User, User.id == UserRole.user_id)
                        .where(UserRole.role_id == r.id))
    return {"id": r.id, "name": r.name, "system": r.company_id is None, "members": members,
            "permissions": sorted(p.code for p in r.permissions)}


@router.get("/roles")
def roles(ctx: Ctx = Depends(employees_perm), db: Session = Depends(get_db)):
    return {"items": [_role_dict(db, r) for r in db.scalars(select(Role).order_by(Role.company_id.nulls_first(), Role.name))],
            "permissions": [{"code": k, "description": v} for k, v in PERMISSIONS.items()]}


@router.post("/roles", status_code=201)
def create_role(body: RoleIn, ctx: Ctx = Depends(require("settings.manage")), db: Session = Depends(get_db)):
    perms = list(db.scalars(select(Permission).where(Permission.code.in_(body.permissions))))
    r = Role(company_id=ctx.cid, name=body.name.strip(), permissions=perms)
    db.add(r)
    db.flush()
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="role.created", entity="role", entity_id=r.id,
          new=_role_dict(db, r))
    db.commit()
    return _role_dict(db, r)


@router.put("/roles/{rid}")
def update_role(rid: uuid.UUID, body: RoleIn, ctx: Ctx = Depends(require("settings.manage")), db: Session = Depends(get_db)):
    r = db.get(Role, rid)
    if not r:
        raise HTTPException(404, "Role not found")
    if r.company_id is None:
        raise HTTPException(400, "System roles cannot be edited. Create a company role instead.")
    old = _role_dict(db, r)
    r.name = body.name.strip()
    r.permissions = list(db.scalars(select(Permission).where(Permission.code.in_(body.permissions))))
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="role.updated", entity="role", entity_id=r.id,
          old=old, new=_role_dict(db, r))
    db.commit()
    return _role_dict(db, r)


# --------------------------------------------------------------------------- leave types


class LeaveTypeIn(CamelModel):
    code: str
    name: str
    is_paid: bool = True
    yearly_quota: float = 0
    carry_forward_max: float = 0
    active: bool = True


def _lt(t: LeaveType) -> dict:
    return {"id": t.id, "code": t.code, "name": t.name, "is_paid": t.is_paid, "yearly_quota": float(t.yearly_quota),
            "carry_forward_max": float(t.carry_forward_max), "active": t.active}


@router.get("/leave-types")
def leave_types(ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    return {"items": [_lt(t) for t in db.scalars(select(LeaveType).order_by(LeaveType.name))]}


@router.post("/leave-types", status_code=201)
def create_leave_type(body: LeaveTypeIn, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    t = LeaveType(company_id=ctx.cid, **body.model_dump() | {"code": body.code.upper().strip()})
    db.add(t)
    db.flush()
    ensure_balances(db, ctx.cid, date.today().year)
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="leave_type.created", entity="leave_type",
          entity_id=t.id, new=_lt(t))
    db.commit()
    return _lt(t)


@router.put("/leave-types/{tid}")
def update_leave_type(tid: uuid.UUID, body: LeaveTypeIn, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    t = db.get(LeaveType, tid)
    if not t:
        raise HTTPException(404, "Leave type not found")
    old = _lt(t)
    for k, v in body.model_dump().items():
        setattr(t, k, v.upper().strip() if k == "code" else v)
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="leave_type.updated", entity="leave_type",
          entity_id=t.id, old=old, new=_lt(t))
    db.commit()
    return _lt(t)


# --------------------------------------------------------------------------- holiday calendar


class HolidayIn(CamelModel):
    name: str
    date: date
    is_optional: bool = False


@router.post("/holidays", status_code=201)
def create_holiday(body: HolidayIn, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    h = Holiday(company_id=ctx.cid, name=body.name.strip(), date=body.date, is_optional=body.is_optional)
    db.add(h)
    db.flush()
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="holiday.created", entity="holiday", entity_id=h.id,
          new=body.model_dump())
    db.commit()
    return {"id": h.id, "name": h.name, "date": h.date, "is_optional": h.is_optional}


@router.delete("/holidays/{hid}")
def delete_holiday(hid: uuid.UUID, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    h = db.get(Holiday, hid)
    if not h:
        raise HTTPException(404, "Holiday not found")
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="holiday.deleted", entity="holiday", entity_id=h.id,
          old={"name": h.name, "date": h.date, "is_optional": h.is_optional})
    db.delete(h)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- payroll lock + audit


class LockIn(CamelModel):
    year: int
    month: int


@router.get("/payroll-lock")
def locks(ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    rows = db.scalars(select(PayrollLock).order_by(PayrollLock.year.desc(), PayrollLock.month.desc()))
    return {"items": [{"id": l.id, "year": l.year, "month": l.month, "locked_by": brief(db.get(User, l.locked_by)),
                       "created_at": l.created_at} for l in rows]}


@router.post("/payroll-lock", status_code=201)
def lock(body: LockIn, ctx: Ctx = Depends(settings_perm), db: Session = Depends(get_db)):
    if not 1 <= body.month <= 12:
        raise HTTPException(400, "Invalid month")
    if db.scalar(select(PayrollLock).where(PayrollLock.year == body.year, PayrollLock.month == body.month)):
        raise HTTPException(409, "This month is already locked")
    db.add(PayrollLock(company_id=ctx.cid, year=body.year, month=body.month, locked_by=ctx.user.id))
    audit(db, company_id=ctx.cid, actor_id=ctx.user.id, action="payroll.locked", entity="payroll_lock",
          new=body.model_dump())
    db.commit()
    return {"ok": True}


@router.get("/audit-logs")
def audit_logs(entity: str | None = None, limit: int = 200, ctx: Ctx = Depends(require("audit.view")),
               db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(min(limit, 1000)))
    return {"items": [{"id": a.id, "actor": brief(db.get(User, a.actor_id)) if a.actor_id else None,
                       "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "old_value": a.old_value,
                       "new_value": a.new_value, "created_at": a.created_at} for a in rows]}
