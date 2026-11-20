from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..common import CamelModel, brief
from ..config import settings
from ..db import get_db
from ..deps import Ctx, get_ctx, reportee_ids, tenant_from_request
from ..models import Company, User
from ..security import create_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(CamelModel):
    workspace: str | None = None  # company subdomain, or "admin" for the master admin console
    login: str  # email or employee code
    password: str


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(settings.cookie_name, token, httponly=True, samesite="lax",
                        max_age=settings.jwt_expire_minutes * 60, path="/")


def me_payload(db: Session, ctx: Ctx) -> dict:
    u = ctx.user
    return {
        "user": {**brief(u), "is_master_admin": u.is_master_admin, "date_of_birth": u.date_of_birth},
        "company": {"id": ctx.company.id, "name": ctx.company.name, "subdomain": ctx.company.subdomain,
                    "plan": ctx.company.plan,
                    "timezone": ctx.company.settings.timezone if ctx.company.settings else "UTC"}
        if ctx.company else None,
        "roles": [r.name for r in u.roles],
        "permissions": sorted(ctx.permissions),
        "has_reportees": bool(ctx.company and reportee_ids(db, u.id)),
        "impersonating": ctx.impersonator_id is not None,
        "enabled_modules": ctx.company.settings.enabled_modules if ctx.company and ctx.company.settings else [],
    }


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    workspace = (body.workspace or tenant_from_request(request) or "").strip().lower()
    if not workspace:
        raise HTTPException(400, "Enter your company workspace")
    ident = body.login.strip()

    if workspace == "admin":
        user = db.scalar(select(User).where(User.is_master_admin.is_(True), func.lower(User.email) == ident.lower()))
        company = None
    else:
        company = db.scalar(select(Company).where(Company.subdomain == workspace))
        if not company:
            raise HTTPException(401, "Invalid workspace, login or password")
        if company.status != "active":
            raise HTTPException(403, "This company account is suspended")
        user = db.scalar(select(User).where(
            User.company_id == company.id,
            or_(func.lower(User.email) == ident.lower(), User.employee_code == ident),
        ))
    if not user or user.status != "active" or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid workspace, login or password")

    set_session_cookie(response, create_token(str(user.id), str(company.id) if company else None))
    return {"ok": True, "workspace": workspace}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(settings.cookie_name, path="/")
    return {"ok": True}


@router.get("/me")
def me(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    return me_payload(db, ctx)


@router.get("/sso/saml")
def sso_saml():
    raise HTTPException(501, "SAML SSO is not configured for this company")
