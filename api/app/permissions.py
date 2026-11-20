"""Permission catalogue and default system roles (documentation.md §3)."""

PERMISSIONS: dict[str, str] = {
    "attendance.checkin": "Check in and out",
    "attendance.view.self": "View own attendance",
    "attendance.view.team": "View team attendance",
    "attendance.rationalize.request": "Request attendance rationalization",
    "attendance.rationalize.direct": "Rationalize team attendance directly",
    "attendance.rationalize.approve": "Approve rationalization requests",
    "leave.apply": "Apply for leave",
    "leave.approve": "Approve leave requests",
    "holiday.apply": "Apply for optional holidays",
    "holiday.approve": "Approve optional holiday requests",
    "holiday.reports": "View holiday reports",
    "orgchart.view": "View org chart",
    "orgchart.export": "Export org chart",
    "profile.view.all": "View any employee's full profile",
    "settings.manage": "Manage company settings",
    "employees.manage": "Manage employees",
    "audit.view": "View the audit log",
}

EMPLOYEE = [
    "attendance.checkin", "attendance.view.self", "attendance.rationalize.request",
    "leave.apply", "holiday.apply", "orgchart.view", "orgchart.export",
]
MANAGER = EMPLOYEE + [
    "attendance.view.team", "attendance.rationalize.direct", "attendance.rationalize.approve",
    "leave.approve", "holiday.approve", "holiday.reports",
]
COMPANY_ADMIN = list(PERMISSIONS.keys())

DEFAULT_ROLES: dict[str, list[str]] = {
    "Employee": EMPLOYEE,
    "Manager": MANAGER,
    "Company Admin": COMPANY_ADMIN,
}
