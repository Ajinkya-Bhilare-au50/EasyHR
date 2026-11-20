"use client";

import {
  ArrowRight, Cake, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, Clock, Gift, History, ListChecks,
  Palmtree, PartyPopper, Wallet, CalendarClock, Fingerprint,
} from "lucide-react";
import { useState } from "react";
import { useApi } from "@/lib/api";
import type { AttendanceDay, UserBrief } from "@/lib/types";
import { cn, fmtDate, fmtHours, fmtTime, isoDate, addDays } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { AttendanceBadge, Badge, StatusBadge, attendanceStatus } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { EmptyState, ErrorState, Skeleton } from "../ui/feedback";
import { Bone } from "../ui/skeletons";
import { KpiCard } from "../ui/page";
import { Segmented } from "../ui/tabs";
import { useAuth } from "../shell/auth";
import { CheckInWidget } from "./checkin-widget";

type Dashboard = {
  today: string;
  balances: { code: string; name: string; isPaid: boolean; available: number; used: number }[];
  coBalance: number;
  sanctionedLop: number;
  upcomingHolidays: { id: string; name: string; date: string; isOptional: boolean; weekday: string; inDays: number }[];
  birthdays: { user: UserBrief; date: string; inDays: number; isToday: boolean }[];
  recentLeaves: { id: string; type: string; code: string; fromDate: string; toDate: string; days: number; status: string }[];
  pendingApprovals: { leave: number; holiday: number; rationalization: number };
  myPendingRequests: number;
};

type Summary = { days: AttendanceDay[]; counts: Record<string, number>; averageHours: number };
type Raw = { items: { id: string; date: string; time: string; type: string; source: string; location: string | null }[] };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardView() {
  const { me, can } = useAuth();
  const { data, error, reload } = useApi<Dashboard>("/dashboard");
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const summary = useApi<Summary>(`/attendance?from=${monthStart}`);
  const firstName = me.user.name.split(" ")[0];
  const myBirthday = data?.birthdays.find((b) => b.isToday && b.user.id === me.user.id);
  const approvals = data ? data.pendingApprovals.leave + data.pendingApprovals.holiday + data.pendingApprovals.rationalization : 0;
  const isApprover = can("leave.approve") || can("attendance.rationalize.approve");

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-body text-ink-2">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-8 text-ink sm:text-page">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-body text-ink-2">Here&rsquo;s what&rsquo;s happening with your work today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={Palmtree} href="/holiday?tab=apply">Optional holiday</Button>
          <Button icon={CalendarPlus} href="/leaves?tab=apply">Apply leave</Button>
        </div>
      </div>

      {myBirthday && (
        <div className="flex items-center gap-4 rounded-card border border-warning-line bg-warning-soft px-5 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-warning shadow-card">
            <PartyPopper size={22} />
          </span>
          <div>
            <p className="text-card text-ink">Happy birthday, {firstName}!</p>
            <p className="text-body text-ink-2">Wishing you a wonderful year ahead from everyone at {me.company?.name}.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_1fr]">
        <CheckInWidget onChange={summary.reload} />

        <div className="grid content-start gap-4 sm:grid-cols-2">
          {!data ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[152px] rounded-card" />)
          ) : (
            <>
              <KpiCard icon={Wallet} title="CO balance" value={data.coBalance} unit="days" description="Compensatory off available to use" tone="accent" />
              <KpiCard icon={CalendarClock} title="Sanctioned LOP" value={data.sanctionedLop} unit="days" description={`Loss of pay approved in ${new Date().getFullYear()}`} tone="warning" />
              <KpiCard
                loading={!summary.data}
                icon={CircleCheck}
                title="Present this month"
                value={summary.data?.counts.P ?? "–"}
                unit="days"
                description={summary.data ? `Average ${fmtHours(summary.data.averageHours)} per day` : "Loading…"}
                tone="success"
              />
              {isApprover ? (
                <KpiCard
                  icon={ListChecks}
                  title="Awaiting your approval"
                  value={approvals}
                  description={`${data.pendingApprovals.leave} leave · ${data.pendingApprovals.holiday} holiday · ${data.pendingApprovals.rationalization} attendance`}
                  tone="info"
                  footer={approvals > 0 && <Button variant="secondary" size="sm" iconRight={ArrowRight} href="/leaves?tab=approve">Review</Button>}
                />
              ) : (
                <KpiCard icon={Clock} title="My pending requests" value={data.myPendingRequests} description="Leave, holiday and attendance requests in review" tone="info" />
              )}
            </>
          )}
        </div>
      </div>

      {data && data.balances.some((b) => b.isPaid) && (
        <Card>
          <CardHeader icon={Wallet} title="Leave balances" description={`Available days for ${new Date().getFullYear()}`} action={<Button variant="ghost" size="sm" iconRight={ArrowRight} href="/leaves?tab=apply">Apply</Button>} />
          <CardBody className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {data.balances.map((b) => (
              <div key={b.code} className="rounded-control border border-line p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-helper font-semibold text-ink-2">{b.code}</span>
                  {!b.isPaid && <Badge tone="warning">LWP</Badge>}
                </div>
                <p className="mt-1.5 text-[22px] font-semibold text-ink tabular">{b.isPaid ? b.available : b.used}</p>
                <p className="truncate text-helper text-ink-2">{b.isPaid ? `${b.name} · ${b.used} used` : `${b.name} taken`}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <AttendanceCard summary={summary.data} />
        <HolidaysCard holidays={data?.upcomingHolidays} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BirthdaysCard items={data?.birthdays} />
        <LeaveHistoryCard items={data?.recentLeaves} />
      </div>
    </div>
  );
}

function AttendanceCard({ summary }: { summary: Summary | null }) {
  const [view, setView] = useState<"data" | "raw">("data");
  const from = isoDate(addDays(new Date(), -6));
  const raw = useApi<Raw>(view === "raw" ? `/attendance/raw?from=${from}` : null);
  const statuses = ["P", "A", "L", "H", "WO"];
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        icon={Fingerprint}
        title="Attendance summary"
        description="This month"
        action={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "data", label: "Attendance data" },
              { value: "raw", label: "Raw data" },
            ]}
          />
        }
      />
      <CardBody>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {statuses.map((s) => {
            const meta = attendanceStatus[s];
            const Icon = meta.icon;
            return (
              <div key={s} className="rounded-control bg-subtle px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-helper text-ink-2">
                  <Icon size={13} /> {meta.label}
                </p>
                {!summary ? <Bone className="mt-1.5 h-6 w-8" /> : <p className="mt-0.5 text-section text-ink tabular">{summary.counts[s] ?? 0}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-5 overflow-x-auto">
          {view === "data" ? (
            <table className="w-full min-w-[480px] text-body">
              <thead>
                <tr className="border-b border-line text-left text-helper uppercase tracking-wide text-ink-2">
                  <th className="pb-2 font-semibold">Date</th>
                  <th className="pb-2 font-semibold">In</th>
                  <th className="pb-2 font-semibold">Out</th>
                  <th className="pb-2 font-semibold">Hours</th>
                  <th className="pb-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {!summary &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-line last:border-0" aria-hidden>
                      {Array.from({ length: 5 }).map((_, j) => <td key={j} className="py-3.5 pr-4"><Bone className="h-3.5 w-full" /></td>)}
                    </tr>
                  ))}
                {(summary?.days ?? []).slice(0, 6).map((d) => (
                  <tr key={d.date} className="border-b border-line last:border-0">
                    <td className="py-2.5 font-medium text-ink">
                      {fmtDate(d.date, { year: undefined })} <span className="text-helper font-normal text-ink-3">{d.weekday}</span>
                    </td>
                    <td className="py-2.5 tabular text-ink-2">{fmtTime(d.firstPunch)}</td>
                    <td className="py-2.5 tabular text-ink-2">{fmtTime(d.lastPunch)}</td>
                    <td className="py-2.5 tabular text-ink-2">{fmtHours(d.totalHours)}</td>
                    <td className="py-2.5 text-right"><AttendanceBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[480px] text-body">
              <thead>
                <tr className="border-b border-line text-left text-helper uppercase tracking-wide text-ink-2">
                  <th className="pb-2 font-semibold">Date</th>
                  <th className="pb-2 font-semibold">Time</th>
                  <th className="pb-2 font-semibold">Type</th>
                  <th className="pb-2 font-semibold">Source</th>
                  <th className="pb-2 text-right font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {!raw.data &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-line last:border-0" aria-hidden>
                      {Array.from({ length: 5 }).map((_, j) => <td key={j} className="py-3.5 pr-4"><Bone className="h-3.5 w-full" /></td>)}
                    </tr>
                  ))}
                {(raw.data?.items ?? []).slice(0, 8).map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 font-medium text-ink">{fmtDate(p.date, { year: undefined })}</td>
                    <td className="py-2.5 tabular text-ink-2">{fmtTime(p.time)}</td>
                    <td className="py-2.5"><Badge tone={p.type === "in" ? "success" : "neutral"}>{p.type === "in" ? "In" : "Out"}</Badge></td>
                    <td className="py-2.5 capitalize text-ink-2">{p.source}</td>
                    <td className="py-2.5 text-right text-ink-2">{p.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" iconRight={ArrowRight} href="/attendance?tab=my">View full attendance</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function HolidaysCard({ holidays }: { holidays?: Dashboard["upcomingHolidays"] }) {
  return (
    <Card>
      <CardHeader icon={Palmtree} title="Upcoming holidays" action={<Button variant="ghost" size="sm" href="/holiday">All</Button>} />
      <CardBody className="space-y-1 p-3">
        {!holidays ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)
        ) : holidays.length === 0 ? (
          <EmptyState icon={Palmtree} title="No upcoming holidays" />
        ) : (
          holidays.map((h) => {
            const d = new Date(`${h.date}T00:00:00`);
            return (
              <div key={h.id} className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-subtle">
                <div className={cn("grid w-12 shrink-0 place-items-center rounded-control py-1.5 text-center", h.isOptional ? "bg-secondary-soft text-secondary" : "bg-accent-soft text-accent")}>
                  <span className="text-[11px] font-semibold uppercase leading-none">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                  <span className="text-[18px] font-bold leading-tight tabular">{d.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{h.name}</p>
                  <p className="text-helper text-ink-2">
                    {h.weekday} · {h.inDays === 0 ? "Today" : h.inDays === 1 ? "Tomorrow" : `in ${h.inDays} days`}
                  </p>
                </div>
                {h.isOptional && <Badge tone="info">Optional</Badge>}
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

function BirthdaysCard({ items }: { items?: Dashboard["birthdays"] }) {
  const [i, setI] = useState(0);
  const list = items ?? [];
  const cur = list[Math.min(i, Math.max(0, list.length - 1))];
  return (
    <Card>
      <CardHeader
        icon={Cake}
        title="Birthdays"
        description="Next 30 days"
        action={
          list.length > 1 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" icon={ChevronLeft} aria-label="Previous birthday" onClick={() => setI((x) => (x - 1 + list.length) % list.length)} />
              <Button variant="outline" size="icon-sm" icon={ChevronRight} aria-label="Next birthday" onClick={() => setI((x) => (x + 1) % list.length)} />
            </div>
          )
        }
      />
      <CardBody>
        {!items ? (
          <Skeleton className="h-40" />
        ) : !cur ? (
          <EmptyState icon={Gift} title="No birthdays coming up" />
        ) : (
          <div>
            <div key={cur.user.id} className="flex animate-fade-in flex-col items-center py-2 text-center">
              <div className="relative">
                <Avatar name={cur.user.name} initials={cur.user.initials} src={cur.user.photoUrl} size="xl" />
                {cur.isToday && (
                  <span className="absolute -right-1 -top-1 grid size-8 place-items-center rounded-full bg-warning text-white ring-4 ring-surface">
                    <Cake size={15} />
                  </span>
                )}
              </div>
              <p className="mt-3 text-card text-ink">{cur.user.name}</p>
              <p className="text-helper text-ink-2">{cur.user.designation}</p>
              <Badge tone={cur.isToday ? "warning" : "neutral"} className="mt-3" icon={Cake}>
                {cur.isToday ? "Today" : `${fmtDate(cur.date, { year: undefined })} · in ${cur.inDays} day${cur.inDays === 1 ? "" : "s"}`}
              </Badge>
            </div>
            <div className="mt-4 flex justify-center gap-1.5">
              {list.map((b, j) => (
                <button
                  key={b.user.id}
                  aria-label={`Show ${b.user.name}`}
                  onClick={() => setI(j)}
                  className={cn("h-1.5 rounded-full transition-all", j === i ? "w-5 bg-secondary" : "w-1.5 bg-line-strong")}
                />
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function LeaveHistoryCard({ items }: { items?: Dashboard["recentLeaves"] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader icon={History} title="Leave history" description="Your recent requests" action={<Button variant="ghost" size="sm" iconRight={ArrowRight} href="/leaves?tab=history">View all</Button>} />
      {!items ? (
        <CardBody><Skeleton className="h-40" /></CardBody>
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No leave requests yet" description="When you apply for leave it will show up here." action={<Button size="sm" icon={CalendarPlus} href="/leaves?tab=apply">Apply leave</Button>} />
      ) : (
        <ul>
          {items.map((l) => (
            <li key={l.id} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-[12px] font-bold text-primary-ink">{l.code}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{l.type}</p>
                <p className="text-helper text-ink-2">
                  {fmtDate(l.fromDate)} {l.toDate !== l.fromDate && <>– {fmtDate(l.toDate)}</>} · {l.days} day{l.days === 1 ? "" : "s"}
                </p>
              </div>
              <StatusBadge status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
