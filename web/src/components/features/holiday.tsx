"use client";

import { Ban, CalendarDays, ChartNoAxesCombined, CheckCheck, Eye, LayoutList, Palmtree, Send, Ticket, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Holiday, HolidayRequest, UserBrief } from "@/lib/types";
import { cn, fmtDate, fmtDateTime, isoDate } from "@/lib/utils";
import { PersonCell } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { MonthCalendar } from "../ui/calendar";
import { Card, CardBody, CardHeader, InfoItem } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { EmployeePicker } from "../ui/employee-picker";
import { EmptyState, ErrorState, Skeleton, useToast } from "../ui/feedback";
import { Field, Select, Textarea } from "../ui/form";
import { KpiCard, PageHeader } from "../ui/page";
import { Segmented, Tabs, useTabParam, type TabItem } from "../ui/tabs";
import { ApprovalTimeline } from "../ui/timeline";
import { useAuth } from "../shell/auth";
import { DecisionModal, type Decision } from "./decision";

type HolidayList = { year: number; optionalQuota: number; optionalUsed: number; items: Holiday[] };

export function HolidayView() {
  const { can } = useAuth();
  const pending = useApi<{ items: HolidayRequest[] }>(can("holiday.approve") ? "/holidays/requests?scope=pending" : null);
  const items: TabItem[] = [
    { key: "apply", label: "Apply holiday", icon: Palmtree },
    ...(can("holiday.approve") ? [{ key: "approval", label: "Holiday approval", icon: CheckCheck, count: pending.data?.items.length }] : []),
    ...(can("holiday.reports") ? [{ key: "reports", label: "Reports", icon: ChartNoAxesCombined }] : []),
  ];
  const [tab, setTab] = useTabParam(items);
  return (
    <>
      <PageHeader title="Holiday" description="Your company holiday calendar and optional holidays." />
      <Tabs items={items} value={tab} onChange={setTab} className="mb-6" />
      {tab === "apply" && <ApplyHoliday />}
      {tab === "approval" && <HolidayApproval onChange={pending.reload} />}
      {tab === "reports" && <HolidayReports />}
    </>
  );
}

// --------------------------------------------------------------------------- apply

function ApplyHoliday() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const list = useApi<HolidayList>(`/holidays?year=${year}`);
  const mine = useApi<{ items: HolidayRequest[] }>("/holidays/requests?scope=self");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => new Date(thisYear, new Date().getMonth(), 1));
  const [applyFor, setApplyFor] = useState<Holiday | null>(null);
  const [detail, setDetail] = useState<HolidayRequest | null>(null);
  const today = isoDate(new Date());
  const toast = useToast();

  const reloadAll = () => {
    list.reload();
    mine.reload();
  };

  const cancel = async (r: HolidayRequest) => {
    try {
      await api(`/holidays/requests/${r.id}`, { method: "PATCH", json: { action: "cancel" } });
      toast.success("Request cancelled");
      reloadAll();
    } catch (e) {
      toast.error("Could not cancel", e instanceof Error ? e.message : undefined);
    }
  };

  const events = useMemo(
    () => (list.data?.items ?? []).map((h) => ({ date: h.date, label: h.name, tone: (h.isOptional ? "optional" : "holiday") as "optional" | "holiday" })),
    [list.data],
  );

  if (list.error) return <Card><ErrorState message={list.error} onRetry={list.reload} /></Card>;
  const d = list.data;
  const mandatory = d?.items.filter((h) => !h.isOptional).length ?? 0;
  const optional = d?.items.filter((h) => h.isOptional).length ?? 0;
  const remaining = d ? Math.max(0, d.optionalQuota - d.optionalUsed) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard loading={!d} icon={CalendarDays} title="Company holidays" value={d ? mandatory : "–"} description={`Fixed holidays in ${year}`} tone="accent" />
        <KpiCard loading={!d} icon={Palmtree} title="Optional holidays offered" value={d ? optional : "–"} description="Choose the ones that matter to you" tone="info" />
        <KpiCard loading={!d} icon={Ticket} title="Optional remaining" value={d ? remaining : "–"} unit={d ? `of ${d.optionalQuota}` : undefined} description={`${d?.optionalUsed ?? 0} applied or approved this year`} tone="primary" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            icon={Palmtree}
            title={`Holiday calendar ${year}`}
            action={
              <div className="flex gap-2">
                <div className="w-24">
                  <Select aria-label="Year" className="h-8 text-[13px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y}>{y}</option>)}
                  </Select>
                </div>
                <Segmented value={view} onChange={setView} options={[{ value: "list", label: "List", icon: LayoutList }, { value: "calendar", label: "Calendar", icon: CalendarDays }]} />
              </div>
            }
          />
          {!d ? (
            <CardBody className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</CardBody>
          ) : view === "calendar" ? (
            <CardBody>
              <MonthCalendar month={month} onMonthChange={setMonth} events={events} />
            </CardBody>
          ) : d.items.length === 0 ? (
            <EmptyState icon={Palmtree} title="No holidays configured" />
          ) : (
            <ul>
              {d.items.map((h) => {
                const past = h.date < today;
                const dt = new Date(`${h.date}T00:00:00`);
                return (
                  <li key={h.id} className={cn("flex items-center gap-4 border-b border-line px-5 py-3 last:border-0", past && "opacity-55")}>
                    <div className={cn("grid w-12 shrink-0 place-items-center rounded-control py-1.5 text-center", h.isOptional ? "bg-secondary-soft text-secondary" : "bg-accent-soft text-accent")}>
                      <span className="text-[11px] font-semibold uppercase leading-none">{dt.toLocaleDateString("en-GB", { month: "short" })}</span>
                      <span className="text-[18px] font-bold leading-tight tabular">{dt.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{h.name}</p>
                      <p className="text-helper text-ink-2">{h.weekday}</p>
                    </div>
                    {h.isOptional ? (
                      h.myStatus ? (
                        <StatusBadge status={h.myStatus} />
                      ) : (
                        <Button size="sm" variant="secondary" icon={Send} disabled={past || remaining === 0} onClick={() => setApplyFor(h)}>
                          Apply
                        </Button>
                      )
                    ) : (
                      <Badge tone="accent">Company holiday</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader icon={Ticket} title="My optional holiday requests" />
          {!mine.data ? (
            <CardBody><Skeleton className="h-24" /></CardBody>
          ) : mine.data.items.length === 0 ? (
            <EmptyState icon={Palmtree} title="No requests yet" description="Apply for an optional holiday from the list." />
          ) : (
            <ul>
              {mine.data.items.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{r.holiday.name}</p>
                    <p className="text-helper text-ink-2">{fmtDate(r.holiday.date)} · Backup {r.backup.name}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View" onClick={() => setDetail(r)} />
                  {(r.status === "pending" || r.status === "approved") && r.holiday.date > today && (
                    <Button variant="ghost" size="icon-sm" icon={Ban} aria-label="Cancel request" className="text-danger" onClick={() => cancel(r)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {applyFor && <ApplyModal holiday={applyFor} onClose={() => setApplyFor(null)} onDone={() => { setApplyFor(null); reloadAll(); }} />}
      <HolidayDetail request={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ApplyModal({ holiday, onClose, onDone }: { holiday: Holiday; onClose: () => void; onDone: () => void }) {
  const [backup, setBackup] = useState<UserBrief | null>(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    if (!backup) {
      setErr("Select a backup employee");
      return;
    }
    setBusy(true);
    try {
      await api("/holidays/requests", { method: "POST", json: { holidayId: holiday.id, backupUserId: backup.id, comment: comment || null } });
      toast.success("Request sent", `${holiday.name} is waiting for your manager's approval.`);
      onDone();
    } catch (e) {
      toast.error("Could not apply", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Apply for optional holiday"
      description={`${holiday.name} · ${fmtDate(holiday.date)} (${holiday.weekday})`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button icon={Send} loading={busy} onClick={submit}>Submit request</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Backup employee" required error={err}>
          <EmployeePicker value={backup} onChange={(u) => { setBackup(u); setErr(null); }} invalid={!!err} />
        </Field>
        <Field label="Comment" htmlFor="hcomment">
          <Textarea id="hcomment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything your manager should know" />
        </Field>
      </div>
    </Modal>
  );
}

function HolidayDetail({ request: r, onClose }: { request: HolidayRequest | null; onClose: () => void }) {
  if (!r) return null;
  return (
    <Modal open onClose={onClose} title="Optional holiday request" description={`${r.holiday.name} · ${r.user.name}`}>
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <dl className="grid grid-cols-2 gap-4">
          <InfoItem label="Holiday" value={r.holiday.name} />
          <InfoItem label="Date" value={fmtDate(r.holiday.date)} />
          <InfoItem label="Backup employee" value={r.backup.name} />
          <InfoItem label="Status" value={<StatusBadge status={r.status} />} />
          <InfoItem label="Applied on" value={fmtDateTime(r.createdAt)} />
          <InfoItem label="Comment" value={r.comment} className="col-span-2" />
        </dl>
        {r.timeline && <ApprovalTimeline requester={r.user.name} submittedAt={r.createdAt} steps={r.timeline} finalStatus={r.status} />}
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------------------- approval

function HolidayApproval({ onChange }: { onChange: () => void }) {
  const [scope, setScope] = useState<"pending" | "team">("pending");
  const { data, loading, error, reload } = useApi<{ items: HolidayRequest[] }>(`/holidays/requests?scope=${scope}`);
  const [decision, setDecision] = useState<Decision>(null);
  const [detail, setDetail] = useState<HolidayRequest | null>(null);
  const summary = (r: HolidayRequest) => (
    <div className="space-y-1">
      <p className="font-medium text-ink">{r.user.name} · {r.holiday.name}</p>
      <p className="text-ink-2">{fmtDate(r.holiday.date)} · Backup {r.backup.name}</p>
      {r.comment && <p className="text-ink-2">&ldquo;{r.comment}&rdquo;</p>}
    </div>
  );
  const columns: Column<HolidayRequest>[] = [
    { key: "emp", header: "Employee", cell: (r) => <PersonCell user={r.user} />, value: (r) => r.user.name, hideable: false },
    { key: "hol", header: "Holiday", cell: (r) => <span className="font-medium">{r.holiday.name}</span>, value: (r) => r.holiday.name },
    { key: "date", header: "Date", cell: (r) => fmtDate(r.holiday.date), value: (r) => r.holiday.date },
    { key: "backup", header: "Backup", cell: (r) => r.backup.name, value: (r) => r.backup.name },
    { key: "comment", header: "Comment", cell: (r) => <span className="line-clamp-1 max-w-48">{r.comment ?? "—"}</span>, value: (r) => r.comment },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "act", header: "Action", align: "right", hideable: false,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View" onClick={() => setDetail(r)} />
          {scope === "pending" && (
            <>
              <Button variant="outline" size="sm" icon={XCircle} className="text-danger" onClick={() => setDecision({ id: r.id, action: "reject", summary: summary(r) })}>Reject</Button>
              <Button variant="success" size="sm" icon={CheckCheck} onClick={() => setDecision({ id: r.id, action: "approve", summary: summary(r) })}>Approve</Button>
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
        exportName="holiday-approvals"
        emptyTitle={scope === "pending" ? "No requests waiting for you" : "No team requests"}
        toolbar={<Segmented value={scope} onChange={setScope} options={[{ value: "pending", label: "Awaiting me" }, { value: "team", label: "All team requests" }]} />}
      />
      <DecisionModal decision={decision} endpoint={(id) => `/holidays/requests/${id}`} onClose={() => setDecision(null)} onDone={() => { reload(); onChange(); }} />
      <HolidayDetail request={detail} onClose={() => setDetail(null)} />
    </Card>
  );
}

// --------------------------------------------------------------------------- reports

type Report = {
  year: number;
  quota: number;
  perUser: { user: UserBrief; approved: number; pending: number; rejected: number; remaining: number }[];
  perHoliday: { holiday: Holiday; approved: number; pending: number }[];
};

export function HolidayReports() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data, loading, error, reload } = useApi<Report>(`/holidays/reports?year=${year}`);
  const max = Math.max(1, ...(data?.perHoliday.map((h) => h.approved + h.pending) ?? [1]));
  const columns: Column<Report["perUser"][number]>[] = [
    { key: "emp", header: "Employee", cell: (r) => <PersonCell user={r.user} />, value: (r) => r.user.name, hideable: false },
    { key: "dept", header: "Department", cell: (r) => r.user.department, value: (r) => r.user.department },
    { key: "approved", header: "Approved", cell: (r) => r.approved, value: (r) => r.approved, align: "right" },
    { key: "pending", header: "Pending", cell: (r) => r.pending, value: (r) => r.pending, align: "right" },
    { key: "rejected", header: "Rejected", cell: (r) => r.rejected, value: (r) => r.rejected, align: "right" },
    { key: "remaining", header: "Remaining", cell: (r) => <Badge tone={r.remaining ? "success" : "neutral"}>{r.remaining} of {data?.quota}</Badge>, value: (r) => r.remaining, align: "right" },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={ChartNoAxesCombined}
          title="Optional holiday uptake"
          description="Approved and pending requests per holiday"
          action={
            <div className="w-24">
              <Select aria-label="Year" className="h-8 text-[13px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y}>{y}</option>)}
              </Select>
            </div>
          }
        />
        <CardBody>
          {!data ? (
            <Skeleton className="h-40" />
          ) : data.perHoliday.length === 0 ? (
            <EmptyState title="No optional holidays this year" />
          ) : (
            <div className="space-y-3">
              {data.perHoliday.map((h) => (
                <div key={h.holiday.id} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-ink">{h.holiday.name}</p>
                    <p className="text-helper text-ink-2">{fmtDate(h.holiday.date, { year: undefined })}</p>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-soft" role="img" aria-label={`${h.approved} approved, ${h.pending} pending`}>
                    <div className="h-full bg-secondary" style={{ width: `${(h.approved / max) * 100}%` }} />
                    <div className="h-full bg-warning/70" style={{ width: `${(h.pending / max) * 100}%` }} />
                  </div>
                  <p className="w-28 text-right text-helper text-ink-2 tabular">
                    <span className="font-semibold text-ink">{h.approved}</span> approved · {h.pending} pending
                  </p>
                </div>
              ))}
              <div className="flex gap-4 pt-2 text-helper text-ink-2">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-secondary" />Approved</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning/70" />Pending</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="By employee" description={`Each employee may take ${data?.quota ?? "–"} optional holidays per year`} />
        <DataTable rows={data?.perUser} columns={columns} rowKey={(r) => r.user.id} loading={loading} error={error} onRetry={reload} exportName={`optional-holidays-${year}`} />
      </Card>
    </div>
  );
}
