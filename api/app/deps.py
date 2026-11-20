import uuid
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .db import get_db
from .models import Company, Role, User
from .security import decode_token
from .tenancy import bind_company


def tenant_from_request(request: Request) -> str | None:
    """Resolve the tenant subdomain: X-Tenant header (dev / proxy) or the Host subdomain."""
    explicit = request.headers.get("x-tenant")
    if explicit:
        return explicit.strip().lower()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0]
    suffix = "." + settings.base_domain
    if host.endswith(suffix):
        sub = host[: -len(suffix)]
        if sub and "." not in sub:
            return sub.lower()
    return None


@dataclass
class Ctx:
    user: User
    company: Company | None
    permissions: set[str] = field(default_factory=set)
    impersonator_id: uuid.UUID | None = None

    @property
    def cid(self) -> uuid.UUID:
        if not self.company:
            raise HTTPException(400, "This action needs a company context")
        return self.company.id

    def can(self, perm: str) -> bool:
        return perm in self.permissions


def _token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:]
    return request.cookies.get(settings.cookie_name)


def get_ctx(request: Request, db: Session = Depends(get_db)) -> Ctx:
    token = _token(request)
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    user = db.get(User, uuid.UUID(payload["sub"]), options=[selectinload(User.roles).selectinload(Role.permissions)])
    if not user or user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")

    company = None
    if user.company_id:
        company = db.get(Company, user.company_id)
        if not company or company.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Company is suspended")
        tenant = tenant_from_request(request)
        if tenant and tenant not in (company.subdomain, "admin"):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session belongs to another company")
        bind_company(db, company.id)

    perms = {p.code for r in user.roles for p in r.permissions}
    imp = payload.get("imp")
    return Ctx(user=user, company=company, permissions=perms,
               impersonator_id=uuid.UUID(imp) if imp else None)


def require(*perms: str, any_of: bool = False):
    def checker(ctx: Ctx = Depends(get_ctx)) -> Ctx:
        ok = any(ctx.can(p) for p in perms) if any_of else all(ctx.can(p) for p in perms)
        if not ok:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return ctx
    return checker


def require_master(ctx: Ctx = Depends(get_ctx)) -> Ctx:
    if not ctx.user.is_master_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Master admin only")
    return ctx


def reportee_ids(db: Session, manager_id: uuid.UUID) -> set[uuid.UUID]:
    """Direct and indirect reportees via a recursive CTE on users.manager_id."""
    rows = db.execute(text("""
        WITH RECURSIVE tree AS (
            SELECT id FROM users WHERE manager_id = :m AND status = 'active'
            UNION
            SELECT u.id FROM users u JOIN tree t ON u.manager_id = t.id WHERE u.status = 'active'
        ) SELECT id FROM tree
    """), {"m": manager_id}).scalars()
    return set(rows)


def can_manage_user(db: Session, ctx: Ctx, target_id: uuid.UUID) -> bool:
    """Company admins manage everyone in the company; managers manage their reportees."""
    if ctx.can("employees.manage"):
        target = db.scalar(select(User).where(User.id == target_id))
        return target is not None
    return target_id in reportee_ids(db, ctx.user.id)
