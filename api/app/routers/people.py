import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, extract, func, or_, select
from sqlalchemy.orm import Session

from ..common import CamelModel, brief, company_settings, ensure_balances, resolve_user, search_filter, tenure
from ..db import get_db
from ..deps import Ctx, can_manage_user, get_ctx, reportee_ids, require
from ..models import (
    Compensation, Holiday, LeaveBalance, LeaveRequest, LeaveType, Message, Notification, Rationalization,
    HolidayRequest, User,
)
from ..onboarding import documents_status
from ..services import approvals
from ..services.attendance import local_today

router = APIRouter(prefix="/api", tags=["people"])

ORG_FIELDS = {
    "designation": "Designation", "department": "Department", "division": "Division", "region": "Region",
    "branch": "Branch", "grade": "Grade", "business_segment": "Business segment",
    "business_vertical": "Business vertical", "product": "Product", "cost_centre": "Cost centre",
    "company": "Company", "tenure": "Tenure",
}
ORG_CRITERIA = [k for k in ORG_FIELDS if k not in ("company", "tenure")]


def _active_people(db: Session):
    return select(User).where(User.status == "active", User.is_master_admin.is_(False))


# --------------------------------------------------------------------------- profile


@router.get("/profile/{user_ref}")
def profile(user_ref: str, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    u = ctx.user if user_ref == "me" else resolve_user(db, user_ref)
    is_self = u.id == ctx.user.id
    full = is_self or ctx.can("profile.view.all") or can_manage_user(db, ctx, u.id)
    data = {
        "user": {**brief(u), "status": u.status},
        "can_view_private": full,
        "professional": {
            "employee_code": u.employee_code, "designation": u.designation, "department": u.department,
            "division": u.division, "region": u.region, "branch": u.branch, "grade": u.grade,
            "business_segment": u.business_segment, "business_vertical": u.business_vertical,
            "product": u.product, "cost_centre": u.cost_centre, "joined_on": u.joined_on,
            "tenure": tenure(u.joined_on), "manager": brief(u.manager), "work_email": u.email,
            "summary": u.professional_summary or {},
            "reportees": [brief(x) for x in db.scalars(_active_people(db).where(User.manager_id == u.id).order_by(User.name))],
        },
    }
    if full:
        data["personal"] = {
            "date_of_birth": u.date_of_birth, "gender": u.gender, "phone": u.phone,
            "personal_email": u.personal_email, "blood_group": u.blood_group,
            "marital_status": u.marital_status, "address": u.address,
        }
        data["other_details"] = u.other_details or {}
        data["documents"] = documents_status(u.onboarding_docs)
    # Compensation: only the employee themself or HR.
    if is_self or ctx.can("profile.view.all"):
        comps = list(db.scalars(select(Compensation).where(Compensation.user_id == u.id)
                                .order_by(Compensation.effective_from.desc())))
        data["compensation"] = [{"effective_from": c.effective_from, "annual_ctc": float(c.annual_ctc),
                                 "currency": c.currency, "components": c.components} for c in comps]
    return data


class PersonalIn(CamelModel):
    phone: str | None = None
    personal_email: str | None = None
    address: str | None = None
    blood_group: str | None = None
    marital_status: str | None = None


@router.put("/profile/me/personal")
def update_personal(body: PersonalIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    from ..audit import audit
    u = ctx.user
    old = {k: getattr(u, k) for k in body.model_fields}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    audit(db, company_id=ctx.cid, actor_id=u.id, action="profile.updated", entity="user", entity_id=u.id,
          old=old, new=body.model_dump(exclude_unset=True))
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- people pickers


@router.get("/team")
def team(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    """Caller's reportees (fills employee dropdowns). Company admins get everyone."""
    if ctx.can("employees.manage"):
        users = db.scalars(_active_people(db).where(User.id != ctx.user.id).order_by(User.name))
    else:
        ids = reportee_ids(db, ctx.user.id)
        users = db.scalars(select(User).where(User.id.in_(ids)).order_by(User.name)) if ids else []
    return {"items": [brief(u) for u in users]}


@router.get("/employees/lookup")
def lookup(q: str | None = None, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    """Colleague search, e.g. for picking a backup employee."""
    stmt = _active_people(db).where(User.id != ctx.user.id)
    f = search_filter(q)
    if f is not None:
        stmt = stmt.where(f)
    return {"items": [brief(u) for u in db.scalars(stmt.order_by(User.name).limit(25))]}


# --------------------------------------------------------------------------- org chart


@router.get("/orgchart/criteria")
def org_criteria(ctx: Ctx = Depends(require("orgchart.view")), db: Session = Depends(get_db)):
    out = []
    for c in ORG_CRITERIA:
        col = getattr(User, c)
        vals = db.scalars(select(col).where(User.status == "active", col.is_not(None)).distinct().order_by(col))
        out.append({"key": c, "label": ORG_FIELDS[c], "values": [v for v in vals if v]})
    return {"criteria": out, "fields": [{"key": k, "label": v} for k, v in ORG_FIELDS.items()]}


@router.get("/orgchart")
def orgchart(criteria: str | None = None, values: str | None = None, fields: str | None = None,
             ctx: Ctx = Depends(require("orgchart.view")), db: Session = Depends(get_db)):
    people = list(db.scalars(_active_people(db).order_by(User.name)))
    by_id = {u.id: u for u in people}
    wanted = [f for f in (fields or "designation,department").split(",") if f in ORG_FIELDS]

    keep = set(by_id)
    if criteria and values:
        if criteria not in ORG_CRITERIA:
            raise HTTPException(400, "Unknown criteria")
        vals = {v.strip() for v in values.split("|") if v.strip()}
        matched = {u.id for u in people if getattr(u, criteria) in vals}
        # keep ancestors so the hierarchy stays connected
        keep = set(matched)
        for uid in matched:
            m = by_id[uid].manager_id
            while m and m in by_id and m not in keep:
                keep.add(m)
                m = by_id[m].manager_id
    else:
        matched = keep

    today = date.today()
    nodes = []
    for u in people:
        if u.id not in keep:
            continue
        details = {}
        for f in wanted:
            if f == "company":
                details[f] = ctx.company.name
            elif f == "tenure":
                details[f] = tenure(u.joined_on, today)
            else:
                details[f] = getattr(u, f)
        nodes.append({
            "id": u.id, "parent_id": u.manager_id if u.manager_id in keep else None, "name": u.name,
            "initials": brief(u)["initials"], "employee_code": u.employee_code, "designation": u.designation,
            "department": u.department, "details": details, "matched": u.id in matched,
            "is_me": u.id == ctx.user.id,
        })
    return {"nodes": nodes, "fields": [{"key": f, "label": ORG_FIELDS[f]} for f in wanted]}


# --------------------------------------------------------------------------- birthdays + dashboard


def _upcoming_birthdays(db: Session, today: date, days: int = 30) -> list[dict]:
    out = []
    for u in db.scalars(_active_people(db).where(User.date_of_birth.is_not(None))):
        try:
            nxt = u.date_of_birth.replace(year=today.year)
        except ValueError:  # 29 Feb
            nxt = date(today.year, 3, 1)
        if nxt < today:
            try:
                nxt = u.date_of_birth.replace(year=today.year + 1)
            except ValueError:
                nxt = date(today.year + 1, 3, 1)
        delta = (nxt - today).days
        if delta <= days:
            out.append({"user": brief(u), "date": nxt, "in_days": delta, "is_today": delta == 0})
    return sorted(out, key=lambda x: x["in_days"])


@router.get("/birthdays")
def birthdays(month: int | None = None, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    today = local_today(company_settings(db, ctx.cid))
    if month:
        rows = db.scalars(_active_people(db).where(extract("month", User.date_of_birth) == month))
        items = sorted(({"user": brief(u), "date": u.date_of_birth.replace(year=today.year) if not (u.date_of_birth.month == 2 and u.date_of_birth.day == 29) else date(today.year, 2, 28)} for u in rows),
                       key=lambda x: x["date"])
        return {"items": items}
    return {"items": _upcoming_birthdays(db, today)}


@router.get("/dashboard")
def dashboard(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    cs = company_settings(db, ctx.cid)
    today = local_today(cs)
    ensure_balances(db, ctx.cid, today.year, [ctx.user.id])
    db.commit()
    balances = [{"code": b.leave_type.code, "name": b.leave_type.name, "is_paid": b.leave_type.is_paid,
                 "available": float(b.available), "used": float(b.used)}
                for b in db.scalars(select(LeaveBalance).where(LeaveBalance.user_id == ctx.user.id,
                                                               LeaveBalance.year == today.year))]
    co = next((b for b in balances if b["code"] == "CO"), None)
    lop_used = sum(b["used"] for b in balances if not b["is_paid"])

    holidays = [{"id": h.id, "name": h.name, "date": h.date, "is_optional": h.is_optional,
                 "weekday": h.date.strftime("%A"), "in_days": (h.date - today).days}
                for h in db.scalars(select(Holiday).where(Holiday.date >= today).order_by(Holiday.date).limit(5))]
    recent_leaves = [{"id": r.id, "type": r.leave_type.name, "code": r.leave_type.code, "from_date": r.from_date,
                      "to_date": r.to_date, "days": float(r.actual_days), "status": r.status}
                     for r in db.scalars(select(LeaveRequest).where(LeaveRequest.user_id == ctx.user.id)
                                         .order_by(LeaveRequest.created_at.desc()).limit(5))]
    counts = approvals.pending_counts(db, ctx.user.id)
    pending = {t: counts.get(t, 0) for t in ("leave", "holiday", "rationalization")}
    my_pending = (
        db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.user_id == ctx.user.id, LeaveRequest.status == "pending")) +
        db.scalar(select(func.count()).select_from(HolidayRequest).where(HolidayRequest.user_id == ctx.user.id, HolidayRequest.status == "pending")) +
        db.scalar(select(func.count()).select_from(Rationalization).where(Rationalization.user_id == ctx.user.id, Rationalization.status == "pending"))
    )
    return {
        "today": today,
        "balances": balances,
        "co_balance": co["available"] if co else 0,
        "sanctioned_lop": lop_used,
        "upcoming_holidays": holidays,
        "birthdays": _upcoming_birthdays(db, today, 30)[:10],
        "recent_leaves": recent_leaves,
        "pending_approvals": pending,
        "my_pending_requests": my_pending,
    }


# --------------------------------------------------------------------------- notifications + messages


@router.get("/notifications")
def notifications(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Notification).where(Notification.user_id == ctx.user.id)
                           .order_by(Notification.created_at.desc()).limit(30)))
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == ctx.user.id, Notification.read.is_(False)))
    return {"unread": unread, "items": [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
                                         "link": n.link, "read": n.read, "created_at": n.created_at} for n in rows]}


@router.post("/notifications/read-all")
def read_all(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.user_id == ctx.user.id, Notification.read.is_(False))):
        n.read = True
    db.commit()
    return {"ok": True}


@router.get("/messages/conversations")
def conversations(ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    me = ctx.user.id
    msgs = list(db.scalars(select(Message).where(or_(Message.sender_id == me, Message.recipient_id == me))
                           .order_by(Message.created_at.desc()).limit(300)))
    seen, out = set(), []
    for m in msgs:
        other = m.recipient_id if m.sender_id == me else m.sender_id
        if other in seen:
            continue
        seen.add(other)
        unread = sum(1 for x in msgs if x.sender_id == other and x.recipient_id == me and not x.read)
        out.append({"user": brief(db.get(User, other)), "last": m.body, "at": m.created_at, "unread": unread})
    return {"items": out, "unread": sum(c["unread"] for c in out)}


@router.get("/messages")
def thread(with_: str = Query(alias="with"), ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    other = resolve_user(db, with_)
    me = ctx.user.id
    msgs = list(db.scalars(select(Message).where(or_(
        and_(Message.sender_id == me, Message.recipient_id == other.id),
        and_(Message.sender_id == other.id, Message.recipient_id == me))).order_by(Message.created_at).limit(200)))
    for m in msgs:
        if m.recipient_id == me:
            m.read = True
    db.commit()
    return {"user": brief(other), "items": [{"id": m.id, "body": m.body, "mine": m.sender_id == me,
                                             "at": m.created_at} for m in msgs]}


class MessageIn(CamelModel):
    to: str
    body: str


@router.post("/messages", status_code=201)
def send(body: MessageIn, ctx: Ctx = Depends(get_ctx), db: Session = Depends(get_db)):
    other = resolve_user(db, body.to)
    text = body.body.strip()
    if not text or other.id == ctx.user.id:
        raise HTTPException(400, "Write a message to a colleague")
    m = Message(company_id=ctx.cid, sender_id=ctx.user.id, recipient_id=other.id, body=text[:2000])
    db.add(m)
    db.commit()
    return {"id": m.id, "body": m.body, "mine": True, "at": m.created_at}
