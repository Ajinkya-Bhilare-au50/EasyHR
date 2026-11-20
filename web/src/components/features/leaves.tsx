"use client";

import {
  Ban, CalendarDays, CalendarPlus, CheckCheck, CircleHelp, Eye, History, Info, Send, UserRoundCheck, Wallet, XCircle, Ellipsis,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Holiday, LeaveRequest, LeaveTypeBalance, UserBrief } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { PersonCell } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { MonthCalendar, type CalendarEvent } from "../ui/calendar";
import { Card, CardBody, CardHeader, InfoItem } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { EmployeePicker } from "../ui/employee-picker";
import { Alert, EmptyState, Skeleton, useToast } from "../ui/feedback";
import { Field, Input, Select, Textarea } from "../ui/form";
import { MenuList, Popover } from "../ui/menu";
import { PageHeader } from "../ui/page";
import { Segmented, Tabs, useTabParam, type TabItem } from "../ui/tabs";
import { ApprovalTimeline } from "../ui/timeline";
import { useAuth } from "../shell/auth";
import { HelpDrawer } from "../shell/help";
import { DecisionModal, type Decision } from "./decision";

const REASONS = ["Personal work", "Medical", "Family function", "Vacation", "Child care", "Other"];

export function LeavesView() {
  const { can } = useAuth();
  const pending = useApi<{ items: LeaveRequest[] }>(can("leave.approve") ? "/leave/requests?scope=pending" : null);
  const items: TabItem[] = [
    { key: "apply", label: "Leave apply", icon: CalendarPlus },
    ...(can("leave.approve") ? [{ key: "approve", label: "Leave approve", icon: CheckCheck, count: pending.data?.items.length }] : []),
    { key: "history", label: "History", icon: History },
  ];
  const [tab, setTab] = useTabParam(items);
  return (
    <>
      <PageHeader title="Leaves" description="Apply for time off, review your team’s requests and track your history." />
      <Tabs items={items} value={tab} onChange={setTab} className="mb-6" />
      {tab === "apply" && <ApplyLeave onApplied={() => setTab("history")} />}
      {tab === "approve" && <ApproveLeaves onChange={pending.reload} />}
      {tab === "history" && <LeaveHistory />}
    </>
  );
}

// --------------------------------------------------------------------------- apply

function ApplyLeave({ onApplied }: { onApplied: () => void }) {
  const types = useApi<{ year: number; items: LeaveTypeBalance[] }>("/leave/types");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const holidays = useApi<{ items: Holiday[] }>(`/holidays?year=${month.getFullYear()}`);
  const mine = useApi<{ items: LeaveRequest[] }>("/leave/requests?scope=self");
  const [backup, setBackup] = useState<UserBrief | null>(null);
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState<{ appliedDays: number; actualDays: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const toast = useToast();

  const type = types.data?.items.find((t) => t.id === typeId);

  const updateRange = async (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setDays(null);
    if (f && t && t >= f) {
      try {
        setDays(await api("/leave/preview", { method: "POST", json: { fromDate: f, toDate: t } }));
      } catch {}
    }
  };

  const pickDate = (d: string) => {
    if (!from || (from && to)) updateRange(d, d);
    else if (d < from) updateRange(d, from);
    else updateRange(from, d);
  };

  const events: CalendarEvent[] = useMemo(() => {
    const ev: CalendarEvent[] = (holidays.data?.items ?? []).map((h) => ({ date: h.date, label: h.name, tone: h.isOptional ? "optional" : "holiday" }));
    for (const r of mine.data?.items ?? []) {
      if (r.status !== "approved" && r.status !== "pending") continue;
      for (let d = new Date(`${r.fromDate}T00:00:00`); d <= new Date(`${r.toDate}T00:00:00`); d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        ev.push({ date: iso, label: `${r.leaveType.name} (${r.status})`, tone: r.status === "approved" ? "leave" : "pending" });
      }
    }
    return ev;
  }, [holidays.data, mine.data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!backup) errs.backup = "Select a backup employee";
    if (!typeId) errs.type = "Select a leave type";
    if (!from) errs.from = "Select a start date";
    if (!to) errs.to = "Select an end date";
    if (from && to && to < from) errs.to = "End date must be on or after start date";
    if (!reason) errs.reason = "Select a reason";
    if (type?.isPaid && days && days.actualDays > type.available) errs.type = `Only ${type.available} day(s) of ${type.name} available`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api("/leave/requests", {
        method: "POST",
        json: { backupUserId: backup!.id, leaveTypeId: typeId, fromDate: from, toDate: to, reason, description: description || null },
      });
      toast.success("Leave applied", "Your manager has been notified.");
      onApplied();
    } catch (err) {
      toast.error("Could not apply leave", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {!types.data
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-card" />)
          : types.data.items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeId(t.id)}
                className={cn(
                  "rounded-card border bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong",
                  typeId === t.id ? "border-secondary ring-2 ring-secondary/15" : "border-line",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-helper font-semibold text-ink-2">{t.code}</span>
                  {t.isPaid ? <Wallet size={16} className="text-ink-3" /> : <Badge tone="warning">LWP/LOP</Badge>}
                </div>
                <p className="mt-1 text-[22px] font-semibold text-ink tabular">{t.isPaid ? t.available : "—"}</p>
                <p className="truncate text-helper text-ink-2">{t.isPaid ? `${t.name} available` : t.name}</p>
              </button>
            ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader
            icon={CalendarPlus}
            title="Leave apply"
            description="Fields marked * are required"
            action={<Button variant="ghost" size="sm" icon={CircleHelp} onClick={() => setHelp(true)}>Need help?</Button>}
          />
          <form onSubmit={submit} noValidate>
            <CardBody className="grid gap-5 md:grid-cols-2">
              <Field label="Backup employee" required error={errors.backup} className="md:col-span-2" hint="The colleague who will cover your work while you are away.">
                <EmployeePicker value={backup} onChange={setBackup} invalid={!!errors.backup} placeholder="Search a colleague" />
              </Field>
              <Field label="Leave type" htmlFor="lt" required error={errors.type} className="md:col-span-2">
                <Select id="lt" value={typeId} onChange={(e) => setTypeId(e.target.value)} invalid={!!errors.type}>
                  <option value="">Select leave type</option>
                  {types.data?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} {t.isPaid ? `· ${t.available} available` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From date" htmlFor="from" required error={errors.from}>
                <Input id="from" type="date" value={from} onChange={(e) => updateRange(e.target.value, to && to < e.target.value ? e.target.value : to || e.target.value)} invalid={!!errors.from} />
              </Field>
              <Field label="To date" htmlFor="to" required error={errors.to}>
                <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => updateRange(from || e.target.value, e.target.value)} invalid={!!errors.to} />
              </Field>
              <div className="grid grid-cols-2 gap-3 md:col-span-2">
                <div className="rounded-control border border-line bg-subtle px-4 py-3">
                  <p className="text-helper text-ink-2">Applied days</p>
                  <p className="text-section text-ink tabular">{days?.appliedDays ?? "—"}</p>
                </div>
                <div className="rounded-control border border-info-line bg-info-soft px-4 py-3">
                  <p className="text-helper text-info">Actual days (deducted)</p>
                  <p className="text-section text-ink tabular">{days?.actualDays ?? "—"}</p>
                </div>
                <p className="col-span-2 flex items-center gap-1.5 text-helper text-ink-2">
                  <Info size={13} /> Actual days exclude holidays and week-offs, calculated by the server.
                </p>
              </div>
              <Field label="Reason" htmlFor="reason" required error={errors.reason} className="md:col-span-2">
                <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason}>
                  <option value="">Select reason</option>
                  {REASONS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Description" htmlFor="desc" className="md:col-span-2">
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add any details your manager should know" />
              </Field>
            </CardBody>
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => { setBackup(null); setTypeId(""); updateRange("", ""); setReason(""); setDescription(""); setErrors({}); }}>Reset</Button>
              <Button type="submit" icon={Send} loading={busy}>Submit request</Button>
            </div>
          </form>
        </Card>

        <Card className="h-fit">
          <CardHeader icon={CalendarDays} title="Calendar" description="Click a start date, then an end date" />
          <CardBody>
            <MonthCalendar month={month} onMonthChange={setMonth} events={events} range={{ from, to }} onSelect={pickDate} />
          </CardBody>
        </Card>
      </div>
      <HelpDrawer open={help} onClose={() => setHelp(false)} pathname="/leaves" />
    </div>
  );
}

// --------------------------------------------------------------------------- approve

function leaveSummary(r: LeaveRequest) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-ink">{r.user.name} · {r.leaveType.name}</p>
      <p className="text-ink-2">
        {fmtDate(r.fromDate)} – {fmtDate(r.toDate)} · {r.actualDays} day{r.actualDays === 1 ? "" : "s"}
      </p>
      <p className="text-ink-2">Reason: {r.reason}</p>
    </div>
  );
}

function ApproveLeaves({ onChange }: { onChange: () => void }) {
  const [scope, setScope] = useState<"pending" | "team">("pending");
  const { data, loading, error, reload } = useApi<{ items: LeaveRequest[] }>(`/leave/requests?scope=${scope}`);
  const [decision, setDecision] = useState<Decision>(null);
  const [detail, setDetail] = useState<LeaveRequest | null>(null);

  const columns: Column<LeaveRequest>[] = [
    { key: "emp", header: "Employee", cell: (r) => <PersonCell user={r.user} />, value: (r) => r.user.name, hideable: false },
    { key: "type", header: "Leave type", cell: (r) => <span className="font-medium">{r.leaveType.name}{!r.leaveType.isPaid && <Badge tone="warning" className="ml-2">LWP</Badge>}</span>, value: (r) => r.leaveType.name },
    { key: "dates", header: "Dates", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.fromDate)} – {fmtDate(r.toDate)}</span>, value: (r) => r.fromDate },
    { key: "days", header: "Days", cell: (r) => <span className="tabular">{r.actualDays}</span>, value: (r) => r.actualDays, align: "right" },
    { key: "backup", header: "Backup", cell: (r) => r.backup.name, value: (r) => r.backup.name },
    { key: "reason", header: "Reason", cell: (r) => <span className="line-clamp-1 max-w-48">{r.reason}</span>, value: (r) => r.reason },
    { key: "applied", header: "Applied on", cell: (r) => fmtDateTime(r.createdAt), value: (r) => r.createdAt, defaultHidden: true },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "act",
      header: "Action",
      align: "right",
      hideable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View details" onClick={() => setDetail(r)} />
          {scope === "pending" && r.status === "pending" && (
            <>
              <Button variant="outline" size="sm" icon={XCircle} className="text-danger" onClick={() => setDecision({ id: r.id, action: "reject", summary: leaveSummary(r) })}>Reject</Button>
              <Button variant="success" size="sm" icon={CheckCheck} onClick={() => setDecision({ id: r.id, action: "approve", summary: leaveSummary(r) })}>Approve</Button>
            </>
          )}
        </div>
      ),
    },
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
        exportName="leave-approvals"
        emptyTitle={scope === "pending" ? "No requests waiting for you" : "No team leave requests"}
        emptyDescription={scope === "pending" ? "You’re all caught up." : undefined}
        toolbar={
          <Segmented value={scope} onChange={setScope} options={[{ value: "pending", label: "Awaiting me" }, { value: "team", label: "All team requests" }]} />
        }
      />
      <DecisionModal decision={decision} endpoint={(id) => `/leave/requests/${id}`} onClose={() => setDecision(null)} onDone={() => { reload(); onChange(); }} />
      <LeaveDetail request={detail} onClose={() => setDetail(null)} />
    </Card>
  );
}

// --------------------------------------------------------------------------- history

function LeaveHistory() {
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const { data, loading, error, reload } = useApi<{ items: LeaveRequest[] }>(`/leave/requests?scope=self&year=${y}`);
  const [detail, setDetail] = useState<LeaveRequest | null>(null);
  const [cancel, setCancel] = useState<LeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const doCancel = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await api(`/leave/requests/${cancel.id}`, { method: "PATCH", json: { action: "cancel" } });
      toast.success("Leave cancelled");
      setCancel(null);
      reload();
    } catch (e) {
      toast.error("Could not cancel", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<LeaveRequest>[] = [
    { key: "type", header: "Leave type", cell: (r) => <span className="font-medium text-ink">{r.leaveType.name}</span>, value: (r) => r.leaveType.name, hideable: false },
    { key: "from", header: "From", cell: (r) => fmtDate(r.fromDate), value: (r) => r.fromDate },
    { key: "to", header: "To", cell: (r) => fmtDate(r.toDate), value: (r) => r.toDate },
    { key: "applied", header: "Applied days", cell: (r) => r.appliedDays, value: (r) => r.appliedDays, align: "right" },
    { key: "actual", header: "Actual days", cell: (r) => r.actualDays, value: (r) => r.actualDays, align: "right" },
    { key: "backup", header: "Backup", cell: (r) => r.backup.name, value: (r) => r.backup.name },
    { key: "reason", header: "Reason", cell: (r) => r.reason, value: (r) => r.reason, defaultHidden: true },
    { key: "on", header: "Applied on", cell: (r) => fmtDateTime(r.createdAt), value: (r) => r.createdAt },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "act",
      header: "",
      align: "right",
      hideable: false,
      cell: (r) => (
        <Popover trigger={(_, t) => <Button variant="ghost" size="icon-sm" icon={Ellipsis} aria-label="Actions" onClick={t} />}>
          {(close) => (
            <MenuList
              close={close}
              items={[
                { label: "View details", icon: Eye, onClick: () => setDetail(r) },
                { label: "Cancel request", icon: Ban, danger: true, disabled: !(r.status === "pending" || (r.status === "approved" && r.fromDate > today)), onClick: () => setCancel(r) },
              ]}
            />
          )}
        </Popover>
      ),
    },
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
        exportName={`leave-history-${y}`}
        emptyTitle="No leave requests this year"
        toolbar={
          <Field label="Year" className="w-32">
            <Select value={y} onChange={(e) => setY(Number(e.target.value))}>
              {[year + 1, year, year - 1, year - 2].map((v) => <option key={v}>{v}</option>)}
            </Select>
          </Field>
        }
      />
      <LeaveDetail request={detail} onClose={() => setDetail(null)} />
      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        size="sm"
        title="Cancel leave request?"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancel(null)}>Keep it</Button>
            <Button variant="destructive" icon={Ban} loading={busy} onClick={doCancel}>Cancel request</Button>
          </>
        }
      >
        {cancel && (
          <Alert tone="warning" title={`${cancel.leaveType.name}, ${fmtDate(cancel.fromDate)} – ${fmtDate(cancel.toDate)}`}>
            {cancel.status === "approved" ? "The days will be returned to your balance." : "Your manager will no longer see this request."}
          </Alert>
        )}
      </Modal>
    </Card>
  );
}

export function LeaveDetail({ request: r, onClose }: { request: LeaveRequest | null; onClose: () => void }) {
  if (!r) return null;
  return (
    <Modal open onClose={onClose} title="Leave request" description={`${r.leaveType.name} · ${r.user.name}`}>
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <InfoItem label="From" value={fmtDate(r.fromDate)} />
          <InfoItem label="To" value={fmtDate(r.toDate)} />
          <InfoItem label="Applied days" value={r.appliedDays} />
          <InfoItem label="Actual days" value={r.actualDays} />
          <InfoItem label="Backup employee" value={<span className="inline-flex items-center gap-1.5"><UserRoundCheck size={15} className="text-accent" />{r.backup.name}</span>} />
          <InfoItem label="Status" value={<StatusBadge status={r.status} />} />
          <InfoItem label="Reason" value={r.reason} className="col-span-2" />
          {r.description && <InfoItem label="Description" value={<span className="whitespace-pre-wrap">{r.description}</span>} className="col-span-2" />}
        </dl>
        <div>
          <p className="mb-3 text-helper font-semibold uppercase tracking-wide text-ink-3">Approval chain</p>
          {r.timeline ? <ApprovalTimeline requester={r.user.name} submittedAt={r.createdAt} steps={r.timeline} finalStatus={r.status} /> : <EmptyState title="No approval data" />}
        </div>
      </div>
    </Modal>
  );
}

