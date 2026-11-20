"use client";

import {
  CalendarCheck, CheckCheck, CircleCheck, CircleX, Clock, Eye, Fingerprint, History, ListChecks, LogIn, PencilLine,
  RefreshCw, Send, UsersRound, XCircle, CalendarDays, Moon, Palmtree,
} from "lucide-react";
import { useState } from "react";
import { api, qs, useApi } from "@/lib/api";
import type { AttendanceDay, Rationalization, UserBrief } from "@/lib/types";
import { addDays, cn, fmtClock, fmtDate, fmtDateTime, fmtHours, fmtTime, isoDate } from "@/lib/utils";
import { PersonCell } from "../ui/avatar";
import { AttendanceBadge, Badge, StatusBadge, attendanceStatus } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader, InfoItem } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { EmployeePicker } from "../ui/employee-picker";
import { Alert, useToast } from "../ui/feedback";
import { Bone } from "../ui/skeletons";
import { Field, Input, Select, Textarea } from "../ui/form";
import { KpiCard, PageHeader } from "../ui/page";
import { Segmented, Tabs, useTabParam, type TabItem } from "../ui/tabs";
import { useAuth } from "../shell/auth";
import { CheckInWidget } from "./checkin-widget";
import { DecisionModal, type Decision } from "./decision";

const RAT_REASONS = ["Checkout missed", "Check-in missed", "Forgot to punch", "Biometric / device issue", "On duty / client visit", "Other"];

type Usage = { used: number; limit: number; windowDays: number; earliestDate: string; requiresApproval: boolean };

export function AttendanceView() {
  const { can } = useAuth();
  const pending = useApi<{ items: Rationalization[] }>(can("attendance.rationalize.approve") ? "/attendance/rationalizations?scope=pending" : null);
  const items: TabItem[] = [
    { key: "checkin", label: "Check in/out", icon: LogIn },
    ...(can("attendance.view.team") ? [{ key: "daily", label: "Daily status", icon: UsersRound }] : []),
    ...(can("attendance.rationalize.approve") ? [{ key: "approve", label: "Approve", icon: CheckCheck, count: pending.data?.items.length }] : []),
    { key: "my", label: "My attendance", icon: CalendarCheck },
    { key: "history", label: "Rationalize history", icon: History },
  ];
  const [tab, setTab] = useTabParam(items);
  const [ratOpen, setRatOpen] = useState<{ date?: string; user?: UserBrief | null } | null>(null);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check in and out, review daily status and correct missed punches."
        actions={<Button variant="outline" icon={PencilLine} onClick={() => setRatOpen({})}>Rationalize</Button>}
      />
      <Tabs items={items} value={tab} onChange={setTab} className="mb-6" />
      {tab === "checkin" && <CheckInTab onRationalize={() => setRatOpen({})} />}
      {tab === "daily" && <DailyStatus onRationalize={(user, date) => setRatOpen({ user, date })} />}
      {tab === "approve" && <ApproveRationalizations onChange={pending.reload} />}
      {tab === "my" && <MyAttendance onRationalize={(date, user) => setRatOpen({ date, user })} />}
      {tab === "history" && <RationalizeHistory />}
      {ratOpen && (
        <RationalizeModal
          initialDate={ratOpen.date}
          initialUser={ratOpen.user ?? null}
          onClose={() => setRatOpen(null)}
          onDone={() => {
            setRatOpen(null);
            pending.reload();
            if (tab !== "history") setTab("history");
          }}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------- check in/out

function CheckInTab({ onRationalize }: { onRationalize: () => void }) {
  const usage = useApi<Usage>("/attendance/rationalizations/usage");
  const week = useApi<{ days: AttendanceDay[] }>(`/attendance?from=${isoDate(addDays(new Date(), -6))}`);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
      <CheckInWidget onChange={week.reload} />
      <div className="space-y-6">
        <Card>
          <CardHeader icon={CalendarDays} title="Last 7 days" />
          <div className="grid grid-cols-7 divide-x divide-line">
            {!week.data &&
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 px-1 py-4" aria-hidden>
                  <Bone className="h-3 w-7" />
                  <Bone className="h-5 w-6" />
                  <Bone className="size-8 rounded-full" />
                </div>
              ))}
            {(week.data?.days ?? []).slice(0, 7).reverse().map((d) => {
              const meta = d.status ? attendanceStatus[d.status] : null;
              const Icon = meta?.icon ?? Clock;
              return (
                <div key={d.date} className="flex flex-col items-center gap-1.5 px-1 py-4 text-center">
                  <span className="text-helper text-ink-2">{d.weekday}</span>
                  <span className="text-card text-ink tabular">{new Date(`${d.date}T00:00:00`).getDate()}</span>
                  <span
                    title={meta?.label}
                    className={cn(
                      "grid size-8 place-items-center rounded-full",
                      d.status === "P" ? "bg-success-soft text-success" : d.status === "A" ? "bg-danger-soft text-danger" : d.status === "L" ? "bg-info-soft text-info" : d.status === "H" ? "bg-accent-soft text-accent" : d.status === "NM" ? "bg-warning-soft text-warning" : "bg-neutral-soft text-ink-3",
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="hidden text-[11px] text-ink-3 tabular sm:block">{d.totalHours ? fmtHours(d.totalHours) : "—"}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader icon={PencilLine} title="Missed a punch?" description="Request a rationalization and your manager will review it." />
          <CardBody className="space-y-4">
            {!usage.data && (
              <div className="grid grid-cols-3 gap-3" aria-hidden>{Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-[62px]" />)}</div>
            )}
            {usage.data && (
              <div className="grid grid-cols-3 gap-3">
                <InfoBox label="Used this month" value={`${usage.data.used} / ${usage.data.limit}`} />
                <InfoBox label="Allowed window" value={`${usage.data.windowDays} days`} />
                <InfoBox label="Earliest date" value={fmtDate(usage.data.earliestDate, { year: undefined })} />
              </div>
            )}
            <Alert tone="info">Original punches are never changed. Approved corrections are added as separate records and the day is recalculated.</Alert>
            <Button icon={PencilLine} onClick={onRationalize} disabled={!!usage.data && usage.data.used >= usage.data.limit}>
              Request rationalization
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-subtle px-3 py-2.5">
      <p className="text-helper text-ink-2">{label}</p>
      <p className="mt-0.5 text-body font-semibold text-ink tabular">{value}</p>
    </div>
  );
}

// --------------------------------------------------------------------------- daily status

type DailyRow = { user: UserBrief; firstPunch: string | null; lastPunch: string | null; totalHours: number; status: string };

function DailyStatus({ onRationalize }: { onRationalize: (u: UserBrief, d: string) => void }) {
  const [date, setDate] = useState(isoDate(new Date()));
  const { data, loading, error, reload } = useApi<{ items: DailyRow[]; counts: Record<string, number> }>(`/attendance/daily-status?date=${date}`);
  const c = data?.counts ?? {};
  const columns: Column<DailyRow>[] = [
    { key: "emp", header: "Employee", cell: (r) => <PersonCell user={r.user} />, value: (r) => `${r.user.name} ${r.user.employeeCode}`, hideable: false },
    { key: "dept", header: "Department", cell: (r) => r.user.department, value: (r) => r.user.department },
    { key: "in", header: "Check in", cell: (r) => <span className="tabular">{fmtTime(r.firstPunch)}</span>, value: (r) => r.firstPunch },
    { key: "out", header: "Check out", cell: (r) => <span className="tabular">{fmtTime(r.lastPunch)}</span>, value: (r) => r.lastPunch },
    { key: "hours", header: "Hours", cell: (r) => <span className="tabular">{fmtHours(r.totalHours)}</span>, value: (r) => r.totalHours, align: "right" },
    { key: "status", header: "Status", cell: (r) => <AttendanceBadge status={r.status} />, value: (r) => attendanceStatus[r.status]?.label ?? r.status },
    {
      key: "act", header: "Action", align: "right", hideable: false,
      cell: (r) => (r.status === "A" || r.status === "NM" || (r.firstPunch && !r.lastPunch)) && date !== isoDate(new Date())
        ? <Button variant="outline" size="sm" icon={PencilLine} onClick={() => onRationalize(r.user, date)}>Rationalize</Button>
        : null,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard loading={!data} icon={CircleCheck} title="Present" value={c.P ?? 0} tone="success" />
        <KpiCard loading={!data} icon={CircleX} title="Absent" value={(c.A ?? 0)} tone="danger" />
        <KpiCard loading={!data} icon={Clock} title="Not marked" value={c.NM ?? 0} tone="warning" />
        <KpiCard loading={!data} icon={CalendarDays} title="On leave" value={c.L ?? 0} tone="info" />
        <KpiCard loading={!data} icon={Palmtree} title="Holiday / week off" value={(c.H ?? 0) + (c.WO ?? 0)} tone="accent" />
      </div>
      <Card>
        <DataTable
          rows={data?.items}
          columns={columns}
          rowKey={(r) => r.user.id}
          loading={loading}
          error={error}
          onRetry={reload}
          exportName={`daily-status-${date}`}
          searchPlaceholder="Search employee"
          emptyTitle="No team members"
          toolbar={
            <>
              <Field label="Date" className="sm:w-48">
                <Input type="date" value={date} max={isoDate(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </Field>
              <Button variant="outline" icon={RefreshCw} onClick={reload}>Refresh</Button>
            </>
          }
        />
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- approve

function ratSummary(r: Rationalization) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-ink">{r.user.name} · {fmtDate(r.date)}</p>
      <p className="text-ink-2">Check in {fmtClock(r.checkIn)} · Check out {fmtClock(r.checkOut)}</p>
      <p className="text-ink-2">Reason: {r.reason}</p>
    </div>
  );
}

function ApproveRationalizations({ onChange }: { onChange: () => void }) {
  const { data, loading, error, reload } = useApi<{ items: Rationalization[] }>("/attendance/rationalizations?scope=pending");
  const [decision, setDecision] = useState<Decision>(null);
  const columns: Column<Rationalization>[] = [
    { key: "emp", header: "Employee", cell: (r) => <PersonCell user={r.user} />, value: (r) => r.user.name, hideable: false },
    { key: "date", header: "Date", cell: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: "in", header: "Check in", cell: (r) => fmtClock(r.checkIn), value: (r) => r.checkIn },
    { key: "out", header: "Check out", cell: (r) => fmtClock(r.checkOut), value: (r) => r.checkOut },
    { key: "reason", header: "Reason", cell: (r) => r.reason, value: (r) => r.reason },
    { key: "at", header: "Applied", cell: (r) => fmtDateTime(r.requestedAt), value: (r) => r.requestedAt },
    {
      key: "act", header: "Action", align: "right", hideable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" icon={XCircle} className="text-danger" onClick={() => setDecision({ id: r.id, action: "reject", summary: ratSummary(r) })}>Reject</Button>
          <Button variant="success" size="sm" icon={CheckCheck} onClick={() => setDecision({ id: r.id, action: "approve", summary: ratSummary(r) })}>Approve</Button>
        </div>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader icon={ListChecks} title="Rationalization requests" description="Approving adds the missing punch and recalculates the day." />
      <DataTable rows={data?.items} columns={columns} rowKey={(r) => r.id} loading={loading} error={error} onRetry={reload} emptyTitle="No requests waiting for you" emptyDescription="You’re all caught up." />
      <DecisionModal decision={decision} endpoint={(id) => `/attendance/rationalizations/${id}`} onClose={() => setDecision(null)} onDone={() => { reload(); onChange(); }} />
    </Card>
  );
}

// --------------------------------------------------------------------------- my attendance

type RawPunch = { id: string; date: string; time: string; type: string; source: string; location: string | null };

function MyAttendance({ onRationalize }: { onRationalize: (date: string, user?: UserBrief | null) => void }) {
  const { can, me } = useAuth();
  const today = new Date();
  const [from, setFrom] = useState(isoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(today));
  const [user, setUser] = useState<UserBrief | null>(null);
  const [view, setView] = useState<"data" | "raw">("data");
  const params = qs({ userId: user?.id, from, to });
  const summary = useApi<{ days: AttendanceDay[]; counts: Record<string, number>; averageHours: number }>(view === "data" ? `/attendance${params}` : null);
  const raw = useApi<{ items: RawPunch[] }>(view === "raw" ? `/attendance/raw${params}` : null);
  const c = summary.data?.counts ?? {};

  const dayCols: Column<AttendanceDay>[] = [
    { key: "date", header: "Date", cell: (d) => <span className="font-medium text-ink">{fmtDate(d.date)}</span>, value: (d) => d.date, hideable: false },
    { key: "day", header: "Day", cell: (d) => d.weekday, value: (d) => d.weekday },
    { key: "in", header: "First in", cell: (d) => <span className="tabular">{fmtTime(d.firstPunch)}</span>, value: (d) => (d.firstPunch ? fmtTime(d.firstPunch) : "") },
    { key: "out", header: "Last out", cell: (d) => <span className="tabular">{fmtTime(d.lastPunch)}</span>, value: (d) => (d.lastPunch ? fmtTime(d.lastPunch) : "") },
    { key: "hours", header: "Total hours", cell: (d) => <span className="tabular">{fmtHours(d.totalHours)}</span>, value: (d) => d.totalHours, align: "right" },
    { key: "status", header: "Status", cell: (d) => <AttendanceBadge status={d.status} />, value: (d) => (d.status ? attendanceStatus[d.status]?.label : "") },
    {
      key: "act", header: "", align: "right", hideable: false,
      cell: (d) =>
        d.date !== isoDate(today) && (d.status === "A" || (d.firstPunch && !d.lastPunch)) ? (
          <Button variant="ghost" size="sm" icon={PencilLine} onClick={() => onRationalize(d.date, user)}>Rationalize</Button>
        ) : null,
    },
  ];
  const rawCols: Column<RawPunch>[] = [
    { key: "date", header: "Date", cell: (p) => fmtDate(p.date), value: (p) => p.date, hideable: false },
    { key: "time", header: "Time", cell: (p) => <span className="tabular">{fmtTime(p.time)}</span>, value: (p) => p.time },
    { key: "type", header: "Type", cell: (p) => <Badge tone={p.type === "in" ? "success" : "neutral"}>{p.type === "in" ? "Check in" : "Check out"}</Badge>, value: (p) => p.type },
    { key: "source", header: "Source", cell: (p) => <span className="capitalize">{p.source}</span>, value: (p) => p.source },
    { key: "loc", header: "Location", cell: (p) => p.location ?? "—", value: (p) => p.location },
  ];

  const filters = (
    <>
      {can("attendance.view.team") && (
        <Field label="Employee" className="sm:w-64">
          <EmployeePicker source="team" value={user} onChange={setUser} placeholder={`Me (${me.user.name})`} allowClear />
        </Field>
      )}
      <Field label="From" className="sm:w-44">
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
      </Field>
      <Field label="To" className="sm:w-44">
        <Input type="date" value={to} min={from} max={isoDate(today)} onChange={(e) => e.target.value && setTo(e.target.value)} />
      </Field>
      <Segmented value={view} onChange={setView} options={[{ value: "data", label: "Attendance data" }, { value: "raw", label: "Raw data" }]} />
    </>
  );

  return (
    <div className="space-y-6">
      {view === "data" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard loading={!summary.data} icon={CircleCheck} title="Present" value={c.P ?? 0} tone="success" />
          <KpiCard loading={!summary.data} icon={CircleX} title="Absent" value={c.A ?? 0} tone="danger" />
          <KpiCard loading={!summary.data} icon={CalendarDays} title="Leave" value={c.L ?? 0} tone="info" />
          <KpiCard loading={!summary.data} icon={Palmtree} title="Holiday" value={c.H ?? 0} tone="accent" />
          <KpiCard loading={!summary.data} icon={Moon} title="Week off" value={c.WO ?? 0} tone="primary" />
          <KpiCard loading={!summary.data} icon={Fingerprint} title="Avg. hours" value={summary.data ? fmtHours(summary.data.averageHours) : "–"} tone="warning" />
        </div>
      )}
      <Card>
        {view === "data" ? (
          <DataTable key="data" rows={summary.data?.days} columns={dayCols} rowKey={(d) => d.date} loading={summary.loading} error={summary.error} onRetry={summary.reload} exportName={`attendance-${from}-to-${to}`} toolbar={filters} searchable={false} pageSize={31} />
        ) : (
          <DataTable key="raw" rows={raw.data?.items} columns={rawCols} rowKey={(p) => p.id} loading={raw.loading} error={raw.error} onRetry={raw.reload} exportName={`raw-punches-${from}-to-${to}`} toolbar={filters} searchable={false} pageSize={25} />
        )}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- history

function RationalizeHistory() {
  const { can } = useAuth();
  const team = can("attendance.view.team");
  const [user, setUser] = useState<UserBrief | null>(null);
  const [from, setFrom] = useState(isoDate(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [scope, setScope] = useState<"team" | "self">(team ? "team" : "self");
  const { data, loading, error, reload } = useApi<{ items: Rationalization[] }>(`/attendance/rationalizations${qs({ scope, userId: scope === "team" ? user?.id : undefined, from, to })}`);
  const [detail, setDetail] = useState<Rationalization | null>(null);

  const columns: Column<Rationalization>[] = [
    ...(scope === "team" ? [{ key: "emp", header: "Employee", cell: (r: Rationalization) => <PersonCell user={r.user} />, value: (r: Rationalization) => r.user.name, hideable: false }] : []),
    { key: "date", header: "Date", cell: (r) => <span className="font-medium text-ink">{fmtDate(r.date)}</span>, value: (r) => r.date },
    { key: "in", header: "Check in", cell: (r) => fmtClock(r.checkIn), value: (r) => r.checkIn },
    { key: "out", header: "Check out", cell: (r) => fmtClock(r.checkOut), value: (r) => r.checkOut },
    { key: "reason", header: "Reason", cell: (r) => r.reason, value: (r) => r.reason },
    { key: "status", header: "Status", cell: (r) => <span className="inline-flex items-center gap-1.5"><StatusBadge status={r.status} />{r.direct && <Badge tone="info">Direct</Badge>}</span>, value: (r) => r.status },
    { key: "at", header: "Applied date/time", cell: (r) => fmtDateTime(r.requestedAt), value: (r) => r.requestedAt },
    { key: "by", header: "Decided by", cell: (r) => r.decidedBy?.name ?? "—", value: (r) => r.decidedBy?.name, defaultHidden: true },
    { key: "act", header: "Action", align: "right", hideable: false, cell: (r) => <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View" onClick={() => setDetail(r)} /> },
  ];

  return (
    <Card>
      <DataTable
        rows={data?.items}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        exportName="rationalize-history"
        emptyTitle="No rationalization records"
        emptyDescription="Try widening the date range."
        initialSort={{ key: "at", dir: "desc" }}
        toolbar={
          <>
            {team && <Segmented value={scope} onChange={setScope} options={[{ value: "team", label: "My team" }, { value: "self", label: "Mine" }]} />}
            {team && scope === "team" && (
              <Field label="Employee" className="sm:w-60">
                <EmployeePicker source="team" value={user} onChange={setUser} placeholder="All reportees" allowClear />
              </Field>
            )}
            <Field label="From date" className="sm:w-44">
              <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label="To date" className="sm:w-44">
              <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </>
        }
      />
      {detail && (
        <Modal open onClose={() => setDetail(null)} title="Rationalization" description={`${detail.user.name} · ${fmtDate(detail.date)}`}>
          <dl className="grid grid-cols-2 gap-4">
            <InfoItem label="Check in" value={fmtClock(detail.checkIn)} />
            <InfoItem label="Check out" value={fmtClock(detail.checkOut)} />
            <InfoItem label="Status" value={<StatusBadge status={detail.status} />} />
            <InfoItem label="Type" value={detail.direct ? "Direct (by manager)" : "Employee request"} />
            <InfoItem label="Requested by" value={detail.requestedBy.name} />
            <InfoItem label="Requested at" value={fmtDateTime(detail.requestedAt)} />
            <InfoItem label="Decided by" value={detail.decidedBy?.name} />
            <InfoItem label="Decided at" value={fmtDateTime(detail.decidedAt)} />
            <InfoItem label="Reason" value={detail.reason} className="col-span-2" />
            {detail.decisionComment && <InfoItem label="Decision comment" value={detail.decisionComment} className="col-span-2" />}
          </dl>
        </Modal>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------- rationalize form

function RationalizeModal({ initialDate, initialUser, onClose, onDone }: { initialDate?: string; initialUser: UserBrief | null; onClose: () => void; onDone: () => void }) {
  const { can, me } = useAuth();
  const canDirect = can("attendance.rationalize.direct");
  const usage = useApi<Usage>("/attendance/rationalizations/usage");
  const [user, setUser] = useState<UserBrief | null>(initialUser && initialUser.id !== me.user.id ? initialUser : null);
  const [date, setDate] = useState(initialDate ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const direct = !!user;

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!date) errs.date = "Select a date";
    if (!checkIn && !checkOut) errs.time = "Enter a check-in or check-out time";
    if (checkIn && checkOut && checkOut <= checkIn) errs.time = "Check-out must be after check-in";
    if (!reason) errs.reason = "Select a reason";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api<Rationalization>("/attendance/rationalizations", {
        method: "POST",
        json: { userId: user?.id, date, checkIn: checkIn || null, checkOut: checkOut || null, reason: note ? `${reason} – ${note}` : reason },
      });
      toast.success(r.status === "approved" ? "Attendance rationalized" : "Request sent", r.status === "approved" ? "The day has been recalculated." : "Your manager will review it.");
      onDone();
    } catch (e) {
      toast.error("Could not submit", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Rationalize attendance"
      description={direct ? "Direct correction: approved immediately and logged." : "Request a correction for a missed punch."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button icon={direct ? CheckCheck : Send} loading={busy} onClick={submit}>{direct ? "Rationalize now" : "Submit request"}</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {canDirect && (
          <Field label="Employee" className="sm:col-span-2" hint="Leave empty to request a correction for yourself.">
            <EmployeePicker source="team" value={user} onChange={setUser} placeholder={`Myself (${me.user.name})`} allowClear />
          </Field>
        )}
        <Field label="Date" htmlFor="rdate" required error={errors.date} className="sm:col-span-2" hint={usage.data && `Allowed from ${fmtDate(usage.data.earliestDate)} · ${!direct ? `${usage.data.used} of ${usage.data.limit} used this month` : ""}`}>
          <Input id="rdate" type="date" value={date} min={usage.data?.earliestDate} max={isoDate(new Date())} onChange={(e) => setDate(e.target.value)} invalid={!!errors.date} />
        </Field>
        <Field label="Check in" htmlFor="rin" error={errors.time}>
          <Input id="rin" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} invalid={!!errors.time} />
        </Field>
        <Field label="Check out" htmlFor="rout">
          <Input id="rout" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} invalid={!!errors.time} />
        </Field>
        <Field label="Reason" htmlFor="rreason" required error={errors.reason} className="sm:col-span-2">
          <Select id="rreason" value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason}>
            <option value="">Select reason</option>
            {RAT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Note" htmlFor="rnote" className="sm:col-span-2">
          <Textarea id="rnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional details" className="min-h-20" />
        </Field>
      </div>
    </Modal>
  );
}
