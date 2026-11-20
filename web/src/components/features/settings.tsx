"use client";

import { RequirePermission } from "../shell/guard";
import { CalendarDays, KeyRound, Lock, Palmtree, Pencil, Plus, Save, Settings2, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { Alert, useToast } from "../ui/feedback";
import { Bone, FormCardSkeleton } from "../ui/skeletons";
import { Checkbox, Field, Input, Select, Switch } from "../ui/form";
import { PageHeader } from "../ui/page";
import { Tabs, useTabParam } from "../ui/tabs";

const TABS = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "leave-types", label: "Leave types", icon: Wallet },
  { key: "holidays", label: "Holiday calendar", icon: Palmtree },
  { key: "roles", label: "Roles & permissions", icon: ShieldCheck },
  { key: "payroll", label: "Payroll lock", icon: Lock },
];

export function SettingsView() {
  return <RequirePermission any={["settings.manage"]}><SettingsViewInner /></RequirePermission>;
}

function SettingsViewInner() {
  const [tab, setTab] = useTabParam(TABS);
  return (
    <>
      <PageHeader title="Settings" description="Configure how EasyHR works for your company. Changes are audit-logged." />
      <Tabs items={TABS} value={tab} onChange={setTab} className="mb-6" />
      {tab === "general" && <General />}
      {tab === "leave-types" && <LeaveTypes />}
      {tab === "holidays" && <Holidays />}
      {tab === "roles" && <Roles />}
      {tab === "payroll" && <Payroll />}
    </>
  );
}

// --------------------------------------------------------------------------- general

type Settings = {
  shiftStart: string; shiftEnd: string; timezone: string; rationalizeWindowDays: number; rationalizeMonthlyLimit: number;
  rationalizeRequiresApproval: boolean; payrollLockDay: number; optionalHolidaysPerYear: number; approvalLevels: number; weekOffs: number[];
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function General() {
  const { data } = useApi<Settings>("/admin/settings");
  if (data) return <GeneralForm initial={data} />;
  // Mirrors GeneralForm: "Shift and calendar" and "Rules" cards side by side, Save button below.
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FormCardSkeleton fields={6} />
      <FormCardSkeleton fields={6} />
      <div className="flex justify-end lg:col-span-2">
        <Bone className="h-btn w-36" />
      </div>
    </div>
  );
}

function GeneralForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const save = async () => {
    setBusy(true);
    try {
      setS(await api<Settings>("/admin/settings", { method: "PUT", json: { ...s, shiftStart: s.shiftStart.slice(0, 5), shiftEnd: s.shiftEnd.slice(0, 5) } }));
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader icon={CalendarDays} title="Shift and calendar" />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field label="Shift start"><Input type="time" value={s.shiftStart.slice(0, 5)} onChange={(e) => setS({ ...s, shiftStart: e.target.value })} /></Field>
          <Field label="Shift end"><Input type="time" value={s.shiftEnd.slice(0, 5)} onChange={(e) => setS({ ...s, shiftEnd: e.target.value })} /></Field>
          <Field label="Timezone" className="sm:col-span-2" hint="Punch times and day boundaries use this zone.">
            <Select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
              {["Asia/Calcutta", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-medium text-ink">Week-offs</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = s.weekOffs.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setS({ ...s, weekOffs: on ? s.weekOffs.filter((x) => x !== i) : [...s.weekOffs, i].sort() })}
                    className={cn("h-9 w-12 rounded-control border text-[13px] font-medium transition-colors", on ? "border-secondary bg-secondary-soft text-secondary" : "border-line text-ink-2 hover:border-line-strong")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={ShieldCheck} title="Rules" />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field label="Rationalize window (days back)"><Input type="number" min={0} max={90} value={s.rationalizeWindowDays} onChange={num("rationalizeWindowDays")} /></Field>
          <Field label="Rationalize limit per month"><Input type="number" min={0} max={31} value={s.rationalizeMonthlyLimit} onChange={num("rationalizeMonthlyLimit")} /></Field>
          <Field label="Optional holidays per year"><Input type="number" min={0} max={20} value={s.optionalHolidaysPerYear} onChange={num("optionalHolidaysPerYear")} /></Field>
          <Field label="Payroll lock day" hint="Day of the month payroll is usually locked"><Input type="number" min={1} max={28} value={s.payrollLockDay} onChange={num("payrollLockDay")} /></Field>
          <Field label="Approval chain" className="sm:col-span-2">
            <Select value={s.approvalLevels} onChange={num("approvalLevels")}>
              <option value={1}>Employee → Manager → Completed</option>
              <option value={2}>Employee → Manager → Manager&rsquo;s manager → Completed</option>
              <option value={3}>Three levels up</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={s.rationalizeRequiresApproval} onChange={(v) => setS({ ...s, rationalizeRequiresApproval: v })} label="Rationalization requires approval" description="When off, employee requests are applied immediately (still audit-logged)." />
          </div>
        </CardBody>
      </Card>
      <div className="flex justify-end lg:col-span-2">
        <Button icon={Save} loading={busy} onClick={save}>Save settings</Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- leave types

type LeaveType = { id: string; code: string; name: string; isPaid: boolean; yearlyQuota: number; carryForwardMax: number; active: boolean };

function LeaveTypes() {
  const { data, loading, error, reload } = useApi<{ items: LeaveType[] }>("/admin/leave-types");
  const [edit, setEdit] = useState<Partial<LeaveType> | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    if (!edit?.code || !edit.name) return;
    setBusy(true);
    try {
      const body = { code: edit.code, name: edit.name, isPaid: edit.isPaid ?? true, yearlyQuota: Number(edit.yearlyQuota ?? 0), carryForwardMax: Number(edit.carryForwardMax ?? 0), active: edit.active ?? true };
      await api(edit.id ? `/admin/leave-types/${edit.id}` : "/admin/leave-types", { method: edit.id ? "PUT" : "POST", json: body });
      toast.success("Leave type saved");
      setEdit(null);
      reload();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  const columns: Column<LeaveType>[] = [
    { key: "code", header: "Code", cell: (t) => <span className="font-semibold">{t.code}</span>, value: (t) => t.code },
    { key: "name", header: "Name", cell: (t) => t.name, value: (t) => t.name },
    { key: "paid", header: "Type", cell: (t) => (t.isPaid ? <Badge tone="success">Paid</Badge> : <Badge tone="warning">LWP / LOP</Badge>), value: (t) => (t.isPaid ? "Paid" : "Unpaid") },
    { key: "quota", header: "Yearly quota", cell: (t) => t.yearlyQuota, value: (t) => t.yearlyQuota, align: "right" },
    { key: "carry", header: "Carry forward (max)", cell: (t) => t.carryForwardMax, value: (t) => t.carryForwardMax, align: "right" },
    { key: "active", header: "Status", cell: (t) => <Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Badge>, value: (t) => String(t.active) },
    { key: "act", header: "", align: "right", hideable: false, cell: (t) => <Button variant="ghost" size="icon-sm" icon={Pencil} aria-label="Edit" onClick={() => setEdit(t)} /> },
  ];
  return (
    <Card>
      <DataTable rows={data?.items} columns={columns} rowKey={(t) => t.id} loading={loading} error={error} onRetry={reload} searchable={false} printable={false}
        toolbar={<Button icon={Plus} onClick={() => setEdit({ isPaid: true, active: true })}>Add leave type</Button>} />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit?.id ? "Edit leave type" : "Add leave type"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button icon={Save} loading={busy} onClick={save} disabled={!edit?.code || !edit?.name}>Save</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required><Input value={edit.code ?? ""} maxLength={10} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Name" required><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Yearly quota"><Input type="number" min={0} step={0.5} value={edit.yearlyQuota ?? 0} onChange={(e) => setEdit({ ...edit, yearlyQuota: Number(e.target.value) })} /></Field>
            <Field label="Carry forward max"><Input type="number" min={0} step={0.5} value={edit.carryForwardMax ?? 0} onChange={(e) => setEdit({ ...edit, carryForwardMax: Number(e.target.value) })} /></Field>
            <div className="space-y-3 sm:col-span-2">
              <Switch checked={edit.isPaid ?? true} onChange={(v) => setEdit({ ...edit, isPaid: v })} label="Paid leave" description="Unpaid types are labelled LWP/LOP and need no balance." />
              <Switch checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// --------------------------------------------------------------------------- holidays

type Hol = { id: string; name: string; date: string; isOptional: boolean; weekday: string };

function Holidays() {
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const { data, loading, error, reload } = useApi<{ items: Hol[] }>(`/holidays?year=${y}`);
  const [form, setForm] = useState<{ name: string; date: string; isOptional: boolean } | null>(null);
  const toast = useToast();
  const add = async () => {
    if (!form?.name || !form.date) return;
    try {
      await api("/admin/holidays", { method: "POST", json: form });
      toast.success("Holiday added");
      setForm(null);
      reload();
    } catch (e) {
      toast.error("Could not add", e instanceof Error ? e.message : undefined);
    }
  };
  const remove = async (h: Hol) => {
    if (!confirm(`Delete ${h.name}?`)) return;
    try {
      await api(`/admin/holidays/${h.id}`, { method: "DELETE" });
      toast.success("Holiday deleted");
      reload();
    } catch (e) {
      toast.error("Could not delete", e instanceof Error ? e.message : undefined);
    }
  };
  const columns: Column<Hol>[] = [
    { key: "date", header: "Date", cell: (h) => <span className="font-medium">{fmtDate(h.date)}</span>, value: (h) => h.date },
    { key: "day", header: "Day", cell: (h) => h.weekday, value: (h) => h.weekday },
    { key: "name", header: "Holiday", cell: (h) => h.name, value: (h) => h.name },
    { key: "type", header: "Type", cell: (h) => (h.isOptional ? <Badge tone="info">Optional</Badge> : <Badge tone="accent">Company holiday</Badge>), value: (h) => (h.isOptional ? "Optional" : "Fixed") },
    { key: "act", header: "", align: "right", hideable: false, cell: (h) => <Button variant="ghost" size="icon-sm" icon={Trash2} className="text-danger" aria-label="Delete" onClick={() => remove(h)} /> },
  ];
  return (
    <Card>
      <DataTable rows={data?.items} columns={columns} rowKey={(h) => h.id} loading={loading} error={error} onRetry={reload} pageSize={25} exportName={`holidays-${y}`}
        toolbar={
          <>
            <Field label="Year" className="w-28"><Select value={y} onChange={(e) => setY(Number(e.target.value))}>{[year - 1, year, year + 1].map((v) => <option key={v}>{v}</option>)}</Select></Field>
            <Button icon={Plus} onClick={() => setForm({ name: "", date: "", isOptional: false })}>Add holiday</Button>
          </>
        } />
      <Modal open={!!form} onClose={() => setForm(null)} size="sm" title="Add holiday"
        footer={<><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button icon={Plus} onClick={add} disabled={!form?.name || !form?.date}>Add</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Date" required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Switch checked={form.isOptional} onChange={(v) => setForm({ ...form, isOptional: v })} label="Optional holiday" description="Employees apply for it with a backup employee." />
          </div>
        )}
      </Modal>
    </Card>
  );
}

// --------------------------------------------------------------------------- roles

type Role = { id: string; name: string; system: boolean; members: number; permissions: string[] };

function Roles() {
  const { data, reload } = useApi<{ items: Role[]; permissions: { code: string; description: string }[] }>("/admin/roles");
  const [edit, setEdit] = useState<{ id?: string; name: string; permissions: string[] } | null>(null);
  const toast = useToast();
  const groups = new Map<string, { code: string; description: string }[]>();
  data?.permissions.forEach((p) => {
    const g = p.code.split(".")[0];
    groups.set(g, [...(groups.get(g) ?? []), p]);
  });
  const save = async () => {
    if (!edit?.name) return;
    try {
      await api(edit.id ? `/admin/roles/${edit.id}` : "/admin/roles", { method: edit.id ? "PUT" : "POST", json: { name: edit.name, permissions: edit.permissions } });
      toast.success("Role saved");
      setEdit(null);
      reload();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Roles are sets of permissions">The app checks permissions, never role names. System roles are shared defaults; create a company role to customise access.</Alert>
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setEdit({ name: "", permissions: [] })}>New role</Button></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!data &&
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-4 p-5" aria-hidden>
              <div className="flex items-center gap-3"><Bone className="size-9" /><Bone className="h-4 w-32" /></div>
              <div className="flex flex-wrap gap-1.5">{Array.from({ length: 6 }).map((_, j) => <Bone key={j} className="h-5 w-28" />)}</div>
            </Card>
          ))}
        {data?.items.map((r) => (
          <Card key={r.id} className="flex flex-col">
            <CardHeader icon={KeyRound} title={r.name} description={`${r.members} member${r.members === 1 ? "" : "s"} · ${r.permissions.length} permissions`}
              action={r.system ? <Badge tone="neutral">System</Badge> : <Button variant="ghost" size="icon-sm" icon={Pencil} aria-label="Edit role" onClick={() => setEdit({ id: r.id, name: r.name, permissions: r.permissions })} />} />
            <CardBody className="flex flex-wrap gap-1.5">
              {r.permissions.map((p) => <code key={p} className="rounded-[6px] bg-subtle px-2 py-0.5 text-[11.5px] text-ink-2 ring-1 ring-inset ring-line">{p}</code>)}
            </CardBody>
          </Card>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit role" : "New role"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button icon={Save} onClick={save} disabled={!edit?.name}>Save role</Button></>}>
        {edit && (
          <div className="space-y-5">
            <Field label="Role name" required><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            {[...groups.entries()].map(([g, ps]) => (
              <div key={g}>
                <p className="mb-2 text-helper font-semibold uppercase tracking-wide text-ink-3">{g}</p>
                <div className="space-y-2">
                  {ps.map((p) => (
                    <Checkbox key={p.code} checked={edit.permissions.includes(p.code)}
                      onChange={() => setEdit({ ...edit, permissions: edit.permissions.includes(p.code) ? edit.permissions.filter((x) => x !== p.code) : [...edit.permissions, p.code] })}
                      label={<span>{p.description} <code className="ml-1 text-[11.5px] text-ink-3">{p.code}</code></span>} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// --------------------------------------------------------------------------- payroll

function Payroll() {
  const { data, reload } = useApi<{ items: { id: string; year: number; month: number; lockedBy: UserBrief; createdAt: string }[] }>("/admin/payroll-lock");
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const lock = async () => {
    try {
      await api("/admin/payroll-lock", { method: "POST", json: { year, month } });
      toast.success("Month locked");
      setConfirmOpen(false);
      reload();
    } catch (e) {
      toast.error("Could not lock", e instanceof Error ? e.message : undefined);
    }
  };
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString("en-GB", { month: "long" });
  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="h-fit">
        <CardHeader icon={Lock} title="Lock a month" description="Attendance and leave can no longer change for a locked month." />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month"><Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}</Select></Field>
            <Field label="Year"><Select value={year} onChange={(e) => setYear(Number(e.target.value))}>{[now.getFullYear() - 1, now.getFullYear()].map((v) => <option key={v}>{v}</option>)}</Select></Field>
          </div>
          <Button variant="destructive" icon={Lock} className="w-full" onClick={() => setConfirmOpen(true)}>Lock {monthName(month)} {year}</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Locked months" />
        <ul>
          {!data &&
            Array.from({ length: 2 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-3" aria-hidden>
                <Bone className="size-9" />
                <div className="flex-1 space-y-2"><Bone className="h-3.5 w-32" /><Bone className="h-3 w-56" /></div>
              </li>
            ))}
          {data && !data.items.length && <li className="px-5 py-8 text-center text-body text-ink-2">No months locked yet.</li>}
          {data?.items.map((l) => (
            <li key={l.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <span className="grid size-9 place-items-center rounded-control bg-danger-soft text-danger"><Lock size={16} /></span>
              <div className="flex-1">
                <p className="text-body font-medium text-ink">{monthName(l.month)} {l.year}</p>
                <p className="text-helper text-ink-2">Locked by {l.lockedBy?.name} · {fmtDateTime(l.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} size="sm" title="Lock payroll month?"
        footer={<><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="destructive" icon={Lock} onClick={lock}>Lock month</Button></>}>
        <Alert tone="warning" title={`${monthName(month)} ${year} will be locked`}>Rationalizations, leave applications and cancellations for this month will be blocked. This cannot be undone from the app.</Alert>
      </Modal>
    </div>
  );
}
