"""Master admin APIs (platform owner). Served on the admin workspace."""

import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..common import CamelModel, ensure_balances
from ..db import get_db
from ..deps import Ctx, require_master
from ..models import AttendancePunch, Company, CompanySettings, LeaveType, Role, User
from ..routers.auth import set_session_cookie
from ..security import create_token, hash_password

router = APIRouter(prefix="/api/master", tags=["master admin"])
MODULES = ["attendance", "leave", "holiday", "orgchart"]
DEFAULT_LEAVE_TYPES = [("CL", "Casual leave", True, 12, 0), ("SL", "Sick leave", True, 8, 0),
                       ("PL", "Privilege leave", True, 15, 30), ("CO", "Compensatory off", True, 0, 0),
                       ("LOP", "Loss of pay", False, 0, 0)]


def _company(db: Session, c: Company) -> dict:
    s = c.settings
    active = db.scalar(select(func.count()).select_from(User).where(User.company_id == c.id, User.status == "active"))
    punches = db.scalar(select(func.count()).select_from(AttendancePunch).where(AttendancePunch.company_id == c.id))
    return {"id": c.id, "name": c.name, "subdomain": c.subdomain, "plan": c.plan, "status": c.status,
            "created_at": c.created_at, "enabled_modules": s.enabled_modules if s else [],
            "usage": {"active_employees": active, "attendance_records": punches}}


class CompanyIn(CamelModel):
    name: str
    subdomain: str
    plan: str = "standard"
    enabled_modules: list[str] = MODULES
    admin_name: str
    admin_email: EmailStr
    admin_password: str


@router.get("/companies")
def companies(ctx: Ctx = Depends(require_master), db: Session = Depends(get_db)):
    return {"items": [_company(db, c) for c in db.scalars(select(Company).order_by(Company.created_at.desc()))]}


@router.post("/companies", status_code=201)
def create_company(body: CompanyIn, ctx: Ctx = Depends(require_master), db: Session = Depends(get_db)):
    sub = body.subdomain.strip().lower()
    if not re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", sub) or sub in ("admin", "www", "api", "app"):
        raise HTTPException(400, "Subdomain must be lowercase letters, numbers and hyphens")
    if db.scalar(select(Company).where(Company.subdomain == sub)):
        raise HTTPException(409, "Subdomain is already taken")
    if len(body.admin_password) < 8:
        raise HTTPException(400, "Admin password must be at least 8 characters")
    c = Company(name=body.name.strip(), subdomain=sub, plan=body.plan)
    db.add(c)
    db.flush()
    db.add(CompanySettings(company_id=c.id, enabled_modules=[m for m in body.enabled_modules if m in MODULES]))
    for code, name, paid, quota, carry in DEFAULT_LEAVE_TYPES:
        db.add(LeaveType(company_id=c.id, code=code, name=name, is_paid=paid, yearly_quota=quota, carry_forward_max=carry))
    admin_role = db.scalar(select(Role).where(Role.company_id.is_(None), Role.name == "Company Admin"))
    emp_role = db.scalar(select(Role).where(Role.company_id.is_(None), Role.name == "Employee"))
    admin = User(company_id=c.id, employee_code="1001", name=body.admin_name.strip(), email=str(body.admin_email).lower(),
                 password_hash=hash_password(body.admin_password), designation="HR Administrator",
                 department="Human Resources", joined_on=date.today(), roles=[admin_role, emp_role])
    db.add(admin)
    db.flush()
    ensure_balances(db, c.id, date.today().year, [admin.id])
    audit(db, company_id=None, actor_id=ctx.user.id, action="company.created", entity="company", entity_id=c.id,
          new={"name": c.name, "subdomain": sub, "plan": c.plan, "admin_email": admin.email})
    db.commit()
    db.refresh(c)
    return _company(db, c)


class CompanyPatch(CamelModel):
    plan: str | None = None
    status: str | None = None
    enabled_modules: list[str] | None = None


@router.patch("/companies/{cid}")
def update_company(cid: uuid.UUID, body: CompanyPatch, ctx: Ctx = Depends(require_master), db: Session = Depends(get_db)):
    c = db.get(Company, cid)
    if not c:
        raise HTTPException(404, "Company not found")
    old = _company(db, c)
    if body.plan:
        c.plan = body.plan
    if body.status:
        if body.status not in ("active", "suspended"):
            raise HTTPException(400, "status must be active or suspended")
        c.status = body.status
    if body.enabled_modules is not None:
        c.settings.enabled_modules = [m for m in body.enabled_modules if m in MODULES]
    audit(db, company_id=None, actor_id=ctx.user.id, action="company.updated", entity="company", entity_id=c.id,
          old=old, new=_company(db, c))
    db.commit()
    return _company(db, c)


@router.post("/companies/{cid}/impersonate")
def impersonate(cid: uuid.UUID, response: Response, ctx: Ctx = Depends(require_master), db: Session = Depends(get_db)):
    """Support access: signs in as the company's first admin for 30 minutes. Always audit-logged."""
    c = db.get(Company, cid)
    if not c or c.status != "active":
        raise HTTPException(404, "Active company not found")
    admin = db.scalar(select(User).join(User.roles).where(User.company_id == c.id, User.status == "active",
                                                          Role.name == "Company Admin").limit(1))
    if not admin:
        raise HTTPException(409, "This company has no active admin")
    audit(db, company_id=c.id, actor_id=ctx.user.id, action="master.impersonated", entity="user",
          entity_id=admin.id, new={"as": admin.email, "minutes": 30})
    db.commit()
    set_session_cookie(response, create_token(str(admin.id), str(c.id), impersonator_id=str(ctx.user.id), minutes=30))
    return {"ok": True, "subdomain": c.subdomain}
