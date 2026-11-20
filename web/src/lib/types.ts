export type UserBrief = {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string;
  designation: string | null;
  department: string | null;
  initials: string;
};

export type Me = {
  user: UserBrief & { isMasterAdmin: boolean; dateOfBirth: string | null };
  company: { id: string; name: string; subdomain: string; plan: string; timezone: string } | null;
  roles: string[];
  permissions: string[];
  hasReportees: boolean;
  impersonating: boolean;
  enabledModules: string[];
};

export type Status = "pending" | "approved" | "rejected" | "cancelled";

export type TimelineStep = {
  step: number;
  approver: string | null;
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  comment: string | null;
  decidedAt: string | null;
};

export type LeaveRequest = {
  id: string;
  user: UserBrief;
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  fromDate: string;
  toDate: string;
  appliedDays: number;
  actualDays: number;
  reason: string;
  description: string | null;
  backup: UserBrief;
  status: Status;
  createdAt: string;
  timeline?: TimelineStep[];
};

export type LeaveTypeBalance = {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  label: string;
  yearlyQuota: number;
  available: number;
  used: number;
};

export type Holiday = {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
  weekday: string;
  myStatus?: Status | null;
};

export type HolidayRequest = {
  id: string;
  user: UserBrief;
  holiday: Holiday;
  backup: UserBrief;
  comment: string | null;
  status: Status;
  createdAt: string;
  timeline?: TimelineStep[];
};

export type Rationalization = {
  id: string;
  user: UserBrief;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  reason: string;
  status: Status;
  requestedBy: UserBrief;
  decidedBy: UserBrief | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  direct: boolean;
};

export type AttendanceDay = {
  date: string;
  weekday: string;
  firstPunch: string | null;
  lastPunch: string | null;
  totalHours: number;
  status: string | null;
};

export type TodayState = {
  date: string;
  checkedIn: boolean;
  firstIn: string | null;
  lastOut: string | null;
  workedSeconds: number;
  openSince: string | null;
  shiftStart: string;
  shiftEnd: string;
  timezone: string;
  punches: { time: string; type: "in" | "out"; source: string; location: string | null }[];
  serverTime: string;
};
