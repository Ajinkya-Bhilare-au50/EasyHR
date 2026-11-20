"""Apply migrations and load demo data.

    python -m app.seed            # alembic upgrade head + seed (skips if already seeded)
    python -m app.seed --reset    # drop everything, migrate from scratch, reseed
"""

import random
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select, text

from .common import ensure_balances
from .db import SessionLocal, engine
from .models import (
    AttendancePunch, Company, CompanySettings, Compensation, Holiday, LeaveRequest, LeaveType, Permission, Role, User,
)
from .permissions import DEFAULT_ROLES, PERMISSIONS
from .security import hash_password
from .services import approvals
from .services.attendance import recalc_day
from .services.calendar import count_leave_days

PASSWORD = "Password@123"

PEOPLE = [
    # code, name, manager_code, designation, department, grade, dob(m,d), roles
    ("1001", "Ananya Iyer", None, "Chief Executive Officer", "Leadership", "E1", (3, 14), ["Company Admin", "Manager"]),
    ("1002", "Rohan Mehta", "1001", "Head of Engineering", "Engineering", "E2", (11, 22), ["Manager"]),
    ("1003", "Kavya Nair", "1001", "HR Business Partner", "Human Resources", "M1", (11, 28), ["Company Admin", "Manager"]),
    ("1004", "Vikram Singh", "1001", "Head of Sales", "Sales", "E2", (7, 2), ["Manager"]),
    ("1010", "Priya Sharma", "1002", "Engineering Manager", "Engineering", "M1", (12, 5), ["Manager"]),
    ("2140", "Arjun Patel", "1010", "Senior Software Engineer", "Engineering", "L3", (11, 20), []),
    ("2141", "Sneha Reddy", "1010", "Software Engineer", "Engineering", "L2", (1, 9), []),
    ("2142", "Karan Malhotra", "1010", "QA Engineer", "Engineering", "L2", (12, 1), []),
    ("2150", "Meera Joshi", "1002", "Product Designer", "Design", "L3", (5, 18), []),
    ("2160", "Aditya Rao", "1004", "Account Executive", "Sales", "L2", (8, 30), []),
    ("2161", "Ishita Gupta", "1004", "Sales Development Rep", "Sales", "L1", (12, 12), []),
    ("2170", "Nikhil Verma", "1003", "HR Executive", "Human Resources", "L2", (4, 25), []),
]

BRANCH = {"Engineering": "Bengaluru", "Design": "Bengaluru", "Sales": "Mumbai", "Human Resources": "Pune",
          "Leadership": "Mumbai"}


def holidays_for(year: int):
    fixed = [((1, 26), "Republic Day", False), ((3, 4), "Holi", False), ((5, 1), "Maharashtra Day", False),
             ((8, 15), "Independence Day", False), ((10, 2), "Gandhi Jayanti", False),
             ((11, 8), "Diwali", False), ((12, 25), "Christmas", False),
             ((1, 14), "Makar Sankranti", True), ((3, 21), "Ramzan Id", True), ((8, 28), "Raksha Bandhan", True),
             ((9, 14), "Ganesh Chaturthi", True), ((11, 24), "Guru Nanak Jayanti", True),
             ((12, 31), "New Year's Eve", True)]
    return [(date(year, m, d), name, opt) for (m, d), name, opt in fixed]


def seed_rbac(db):
    for code, desc in PERMISSIONS.items():
        if not db.get(Permission, code):
            db.add(Permission(code=code, description=desc))
    db.flush()
    for name, perms in DEFAULT_ROLES.items():
        role = db.scalar(select(Role).where(Role.company_id.is_(None), Role.name == name))
        if not role:
            role = Role(company_id=None, name=name)
            db.add(role)
        role.permissions = list(db.scalars(select(Permission).where(Permission.code.in_(perms))))
    db.flush()


def seed():
    with SessionLocal() as db:
        seed_rbac(db)
        if not db.scalar(select(User).where(User.is_master_admin.is_(True))):
            db.add(User(company_id=None, name="Platform Admin", email="admin@easyhr.app", is_master_admin=True,
                        password_hash=hash_password("Admin@12345")))
        if db.scalar(select(Company).where(Company.subdomain == "alphabet-inc")):
            db.commit()
            print("Demo company already exists; RBAC refreshed.")
            return

        company = Company(name="Alphabet Inc.", subdomain="alphabet-inc", plan="business")
        db.add(company)
        db.flush()
        cs = CompanySettings(company_id=company.id)
        db.add(cs)
        roles = {r.name: r for r in db.scalars(select(Role).where(Role.company_id.is_(None)))}

        for code, name, paid, quota, carry in [("CL", "Casual leave", True, 12, 0), ("SL", "Sick leave", True, 8, 0),
                                               ("PL", "Privilege leave", True, 15, 30), ("CO", "Compensatory off", True, 2, 0),
                                               ("LOP", "Loss of pay", False, 0, 0)]:
            db.add(LeaveType(company_id=company.id, code=code, name=name, is_paid=paid, yearly_quota=quota,
                             carry_forward_max=carry))
        today = date.today()
        for y in (today.year, today.year + 1):
            for d, name, opt in holidays_for(y):
                db.add(Holiday(company_id=company.id, name=name, date=d, is_optional=opt))
        db.flush()

        users: dict[str, User] = {}
        rnd = random.Random(42)
        for code, name, mgr, desig, dept, grade, (bm, bd), extra_roles in PEOPLE:
            first = name.split()[0].lower()
            u = User(
                company_id=company.id, employee_code=code, name=name, email=f"{first}@alphabet.example.com",
                password_hash=hash_password(PASSWORD), manager_id=users[mgr].id if mgr else None,
                designation=desig, department=dept, division="Technology" if dept in ("Engineering", "Design") else "Business",
                region="West" if BRANCH[dept] in ("Mumbai", "Pune") else "South", branch=BRANCH[dept], grade=grade,
                business_segment="Enterprise", business_vertical="SaaS", product="EasyHR Cloud",
                cost_centre=f"CC-{dept[:3].upper()}", joined_on=date(2019 + rnd.randint(0, 5), rnd.randint(1, 12), rnd.randint(1, 28)),
                date_of_birth=date(1985 + rnd.randint(0, 12), bm, bd), gender=rnd.choice(["Female", "Male"]) ,
                phone=f"+91 98{rnd.randint(10000000, 99999999)}", personal_email=f"{first}.personal@example.com",
                blood_group=rnd.choice(["A+", "B+", "O+", "AB+", "O-"]), marital_status=rnd.choice(["Single", "Married"]),
                address=f"{rnd.randint(1, 200)}, {rnd.choice(['MG Road', 'Park Street', 'Linking Road', 'FC Road'])}, {BRANCH[dept]}",
                professional_summary={"Skills": "Communication, Ownership", "Education": "B.E. / MBA",
                                      "Previous experience": f"{rnd.randint(1, 10)} years"},
                other_details={"PAN": f"ABCDE{rnd.randint(1000, 9999)}F", "Bank": "HDFC Bank ••••" + str(rnd.randint(1000, 9999)),
                               "Emergency contact": f"+91 99{rnd.randint(10000000, 99999999)}", "Work location": BRANCH[dept],
                               "Shift": "General (09:00 - 18:00)"},
                roles=[roles["Employee"]] + [roles[r] for r in extra_roles],
            )
            db.add(u)
            db.flush()
            users[code] = u
            ctc = {"E1": 6000000, "E2": 4200000, "M1": 2800000, "L3": 2200000, "L2": 1400000, "L1": 800000}[grade]
            db.add(Compensation(company_id=company.id, user_id=u.id, effective_from=date(today.year, 4, 1), annual_ctc=ctc,
                                components={"Basic": round(ctc * 0.4), "HRA": round(ctc * 0.2), "Special allowance": round(ctc * 0.3),
                                            "Provident fund": round(ctc * 0.048), "Performance bonus": round(ctc * 0.052)}))
        # Real team member: job details only. No invented birthday, contact, ID or bank details.
        ajinkya = User(
            company_id=company.id, employee_code="2143", name="Ajinkya Bhilare", email="ajinkya@alphabet.example.com",
            password_hash=hash_password(PASSWORD), manager_id=users["1010"].id, designation="Full Stack Developer",
            department="Engineering", division="Technology", region="South", branch="Bengaluru",
            business_segment="Enterprise", business_vertical="SaaS", product="EasyHR Cloud", cost_centre="CC-ENG",
            joined_on=today, professional_summary={}, other_details={}, roles=[roles["Employee"]],
        )
        db.add(ajinkya)
        db.flush()
        users["2143"] = ajinkya
        db.flush()
        ensure_balances(db, company.id, today.year)
        db.flush()

        # Attendance for the last 30 days (company timezone), leaving gaps to rationalize.
        zone = ZoneInfo(cs.timezone)
        hol_dates = {d for d, _, opt in holidays_for(today.year) if not opt}
        for u in users.values():
            if u.employee_code == "2143":  # real person: no invented attendance history
                continue
            for back in range(30, 0, -1):
                d = today - timedelta(days=back)
                if d.weekday() >= 5 or d in hol_dates or rnd.random() < 0.06:
                    continue
                cin = datetime.combine(d, time(8, 45), tzinfo=zone) + timedelta(minutes=rnd.randint(0, 60))
                cout = cin + timedelta(hours=8, minutes=rnd.randint(30, 90))
                db.add(AttendancePunch(company_id=company.id, user_id=u.id, type="in", punch_time=cin,
                                       source=rnd.choice(["web", "web", "mobile", "biometric"]), location=rnd.choice(["WFO", "WFO", "WFH"])))
                if not (u.employee_code == "2140" and back in (2, 4)) and rnd.random() > 0.03:
                    db.add(AttendancePunch(company_id=company.id, user_id=u.id, type="out", punch_time=cout, source="web", location="WFO"))
            db.flush()
            for back in range(30, 0, -1):
                recalc_day(db, cs, u.id, today - timedelta(days=back))

        # Sample leave requests.
        lt = {t.code: t for t in db.scalars(select(LeaveType).where(LeaveType.company_id == company.id))}
        start = today + timedelta(days=(7 - today.weekday()) % 7 + 7)  # a Monday two weeks out
        samples = [("2140", "CL", start, start + timedelta(days=1), "Family function", "2141"),
                   ("2141", "SL", today + timedelta(days=3), today + timedelta(days=3), "Medical appointment", "2142"),
                   ("2160", "PL", start + timedelta(days=7), start + timedelta(days=11), "Vacation", "2161")]
        for code, t, f, to, reason, backup in samples:
            applied, actual = count_leave_days(db, cs, f, to)
            r = LeaveRequest(company_id=company.id, user_id=users[code].id, leave_type_id=lt[t].id, from_date=f, to_date=to,
                             applied_days=applied, actual_days=actual, reason=reason, backup_user_id=users[backup].id)
            db.add(r)
            db.flush()
            approvals.create_chain(db, cs, "leave", r.id, users[code])
        db.commit()
        print("Seeded demo company 'alphabet-inc'.")


def migrate() -> None:
    """Bring the schema to the latest Alembic revision (same as `alembic upgrade head`)."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini")), "head")


def reset_schema() -> None:
    """Drop every table, including alembic_version, so migrations run from scratch."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset_schema()
    migrate()
    seed()
