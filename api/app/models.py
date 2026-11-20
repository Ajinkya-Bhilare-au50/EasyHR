"""Database models. Every company-owned table carries company_id (see documentation.md §4)."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def company_fk(nullable: bool = False):
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=nullable
    )


def user_fk(nullable: bool = False, **kw):
    return mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=nullable, **kw)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------- tenancy


class Company(Base, Timestamped):
    __tablename__ = "companies"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200))
    subdomain: Mapped[str] = mapped_column(String(63), unique=True)
    plan: Mapped[str] = mapped_column(String(40), default="standard")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active / suspended

    settings: Mapped["CompanySettings"] = relationship(back_populates="company", uselist=False)


class CompanySettings(Base):
    __tablename__ = "company_settings"
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    shift_start: Mapped[time] = mapped_column(Time, default=time(9, 0))
    shift_end: Mapped[time] = mapped_column(Time, default=time(18, 0))
    timezone: Mapped[str] = mapped_column(String(60), default="Asia/Calcutta")
    rationalize_window_days: Mapped[int] = mapped_column(Integer, default=7)
    rationalize_monthly_limit: Mapped[int] = mapped_column(Integer, default=3)
    rationalize_requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    payroll_lock_day: Mapped[int] = mapped_column(Integer, default=25)
    optional_holidays_per_year: Mapped[int] = mapped_column(Integer, default=2)
    approval_levels: Mapped[int] = mapped_column(Integer, default=1)  # 1 = manager, 2 = manager + skip-level
    week_offs: Mapped[list] = mapped_column(JSONB, default=lambda: [5, 6])  # Mon=0 .. Sun=6
    enabled_modules: Mapped[list] = mapped_column(
        JSONB, default=lambda: ["attendance", "leave", "holiday", "orgchart"]
    )

    company: Mapped[Company] = relationship(back_populates="settings")


class PayrollLock(Base, Timestamped):
    __tablename__ = "payroll_locks"
    __table_args__ = (UniqueConstraint("company_id", "year", "month"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    locked_by: Mapped[uuid.UUID] = user_fk()


# --------------------------------------------------------------------------- people


class User(Base, Timestamped):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("company_id", "employee_code"),
        UniqueConstraint("company_id", "email"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID | None] = company_fk(nullable=True)  # null = master admin
    employee_code: Mapped[str | None] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(254))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_master_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_id: Mapped[uuid.UUID | None] = user_fk(nullable=True, index=True)

    designation: Mapped[str | None] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(120))
    division: Mapped[str | None] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(120))
    branch: Mapped[str | None] = mapped_column(String(120))
    grade: Mapped[str | None] = mapped_column(String(40))
    business_segment: Mapped[str | None] = mapped_column(String(120))
    business_vertical: Mapped[str | None] = mapped_column(String(120))
    product: Mapped[str | None] = mapped_column(String(120))
    cost_centre: Mapped[str | None] = mapped_column(String(120))
    joined_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active / exited

    # Personal summary
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(20))
    phone: Mapped[str | None] = mapped_column(String(30))
    personal_email: Mapped[str | None] = mapped_column(String(254))
    blood_group: Mapped[str | None] = mapped_column(String(5))
    marital_status: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(Text)
    # Professional summary / other details (free-form, company specific)
    professional_summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    other_details: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Onboarding documents handed over, {doc key: "YYYY-MM-DD" marked}. Checklist only, no files.
    # Keys: app/onboarding.py ONBOARDING_DOCUMENTS.
    onboarding_docs: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    # Set when a profile photo is uploaded (None = no photo). Doubles as the cache-busting version
    # in the photo URL. The image itself lives in user_photos so user lists never load it.
    photo_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    manager: Mapped["User | None"] = relationship(remote_side="User.id")
    # Not eager: most User loads (names in lists) never need roles. Load explicitly where needed.
    roles: Mapped[list["Role"]] = relationship(secondary="user_roles", lazy="select")


class UserPhoto(Base):
    """Profile photo bytes, one row per user. Small (the browser crops to a square and shrinks to
    ~30 KB before upload). Stored in Postgres so it survives redeploys without extra storage."""
    __tablename__ = "user_photos"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                                               primary_key=True)
    company_id: Mapped[uuid.UUID | None] = company_fk(nullable=True)  # tenant-scoped like every company table
    content_type: Mapped[str] = mapped_column(String(30))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Compensation(Base, Timestamped):
    __tablename__ = "compensations"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    effective_from: Mapped[date] = mapped_column(Date)
    annual_ctc: Mapped[float] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    components: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"Basic": 600000, "HRA": ...}


# --------------------------------------------------------------------------- RBAC


class Permission(Base):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(80), primary_key=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("company_id", "name"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID | None] = company_fk(nullable=True)  # null = system default
    name: Mapped[str] = mapped_column(String(60))
    permissions: Mapped[list[Permission]] = relationship(secondary="role_permissions", lazy="selectin")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_code: Mapped[str] = mapped_column(ForeignKey("permissions.code"), primary_key=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


# --------------------------------------------------------------------------- audit + notifications


class AuditLog(Base, Timestamped):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID | None] = company_fk(nullable=True)
    actor_id: Mapped[uuid.UUID | None] = user_fk(nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)


class Notification(Base, Timestamped):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    kind: Mapped[str] = mapped_column(String(20), default="info")  # info / success / warning / danger
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(200))
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class Message(Base, Timestamped):
    """'Send a message' chat in the header."""

    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    sender_id: Mapped[uuid.UUID] = user_fk()
    recipient_id: Mapped[uuid.UUID] = user_fk(index=True)
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)


# --------------------------------------------------------------------------- attendance


class AttendancePunch(Base, Timestamped):
    """Immutable. Corrections are added as new rows with source='rationalized'."""

    __tablename__ = "attendance_punches"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    punch_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    type: Mapped[str] = mapped_column(String(3))  # in / out
    source: Mapped[str] = mapped_column(String(20), default="web")  # web / mobile / biometric / rationalized
    location: Mapped[str | None] = mapped_column(String(120))  # WFO / WFH / geo
    rationalization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rationalizations.id"))


class AttendanceDay(Base):
    __tablename__ = "attendance_days"
    __table_args__ = (UniqueConstraint("user_id", "date"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk()
    date: Mapped[date] = mapped_column(Date, index=True)
    first_punch: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_punch: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_hours: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[str] = mapped_column(String(3), default="A")  # P / A / L / H / WO


class Rationalization(Base):
    __tablename__ = "rationalizations"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    date: Mapped[date] = mapped_column(Date)
    check_in: Mapped[time | None] = mapped_column(Time)
    check_out: Mapped[time | None] = mapped_column(Time)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / approved / rejected
    requested_by: Mapped[uuid.UUID] = user_fk()
    decided_by: Mapped[uuid.UUID | None] = user_fk(nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_comment: Mapped[str | None] = mapped_column(Text)


# --------------------------------------------------------------------------- leave + holiday


class LeaveType(Base):
    __tablename__ = "leave_types"
    __table_args__ = (UniqueConstraint("company_id", "code"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    code: Mapped[str] = mapped_column(String(10))  # CL, SL, PL, CO, LOP
    name: Mapped[str] = mapped_column(String(80))
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)  # unpaid => LWP/LOP
    yearly_quota: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    carry_forward_max: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("user_id", "leave_type_id", "year"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk()
    leave_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leave_types.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    available: Mapped[float] = mapped_column(Numeric(5, 1), default=0)
    used: Mapped[float] = mapped_column(Numeric(5, 1), default=0)

    leave_type: Mapped[LeaveType] = relationship(lazy="joined")


class LeaveRequest(Base, Timestamped):
    __tablename__ = "leave_requests"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    leave_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leave_types.id"))
    from_date: Mapped[date] = mapped_column(Date)
    to_date: Mapped[date] = mapped_column(Date)
    applied_days: Mapped[float] = mapped_column(Numeric(5, 1))
    actual_days: Mapped[float] = mapped_column(Numeric(5, 1))
    reason: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    backup_user_id: Mapped[uuid.UUID] = user_fk()
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected/cancelled

    leave_type: Mapped[LeaveType] = relationship(lazy="joined")


class Holiday(Base):
    __tablename__ = "holidays"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    name: Mapped[str] = mapped_column(String(120))
    date: Mapped[date] = mapped_column(Date, index=True)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False)


class HolidayRequest(Base, Timestamped):
    __tablename__ = "holiday_requests"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    user_id: Mapped[uuid.UUID] = user_fk(index=True)
    holiday_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("holidays.id", ondelete="CASCADE"))
    backup_user_id: Mapped[uuid.UUID] = user_fk()
    comment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")

    holiday: Mapped[Holiday] = relationship(lazy="joined")


class Approval(Base):
    """Shared approval-step table for leave, holiday and rationalization."""

    __tablename__ = "approvals"
    id: Mapped[uuid.UUID] = uuid_pk()
    company_id: Mapped[uuid.UUID] = company_fk()
    request_type: Mapped[str] = mapped_column(String(20))  # leave / holiday / rationalization
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    step_order: Mapped[int] = mapped_column(Integer)
    approver_id: Mapped[uuid.UUID] = user_fk(index=True)
    status: Mapped[str] = mapped_column(String(20), default="waiting")  # waiting / pending / approved / rejected / skipped
    comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
