"use client";

import { Building2, Ellipsis, LogIn, LogOut, Pause, Play, Plus, Puzzle, UsersRound, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { Me } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { ToastProvider, useToast } from "../ui/feedback";
import { Bone, TablePageSkeleton } from "../ui/skeletons";
import { Checkbox, Field, Input, Select } from "../ui/form";
import { MenuList, Popover } from "../ui/menu";
import { KpiCard, PageHeader } from "../ui/page";
import { Logo } from "../shell/logo";
import { CreditBanner, ThemeToggle } from "../shell/theme";

type Company = {
  id: string; name: string; subdomain: string; plan: string; status: string; createdAt: string; enabledModules: string[];
  usage: { activeEmployees: number; attendanceRecords: number };
};
const MODULES = [
  { key: "attendance", label: "Attendance" }, { key: "leave", label: "Leave" }, { key: "holiday", label: "Holiday" }, { key: "orgchart", label: "Org chart" },
];

export function MasterView() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/auth/me")
      .then((m) => (m.user.isMasterAdmin ? setMe(m) : (window.location.href = "/")))
      .catch(() => (window.location.href = "/login"));
  }, []);
  if (!me) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="flex h-header items-center justify-between border-b border-line bg-surface px-4 sm:px-page">
          <Bone className="h-8 w-40" />
          <Bone className="size-8 rounded-full" />
        </div>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:p-page">
          <TablePageSkeleton tabs={0} kpis={3} actions={1} />
        </main>
      </div>
    );
  }
  return (
    <ToastProvider>
      <div className="min-h-screen bg-canvas">
        <CreditBanner />
        <header className="flex h-header items-center justify-between border-b border-line bg-surface px-4 sm:px-page">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="info">Master admin</Badge>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Avatar name={me.user.name} src={me.user.photoUrl} size="sm" />
            <span className="hidden text-body font-medium text-ink sm:block">{me.user.name}</span>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={async () => { await api("/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>Sign out</Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:p-page">
          <Companies />
        </main>
      </div>
    </ToastProvider>
  );
}

function Companies() {
  const { data, loading, error, reload } = useApi<{ items: Company[] }>("/master/companies");
  const [create, setCreate] = useState(false);
  const [modules, setModules] = useState<Company | null>(null);
  const toast = useToast();
  const items = data?.items ?? [];

  const patch = async (c: Company, body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/master/companies/${c.id}`, { method: "PATCH", json: body });
      toast.success(msg);
      reload();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    }
  };
  const impersonate = async (c: Company) => {
    if (!confirm(`Open a 30-minute support session as ${c.name}'s admin? This is audit-logged.`)) return;
    try {
      await api(`/master/companies/${c.id}/impersonate`, { method: "POST" });
      window.location.href = "/";
    } catch (e) {
      toast.error("Could not start session", e instanceof Error ? e.message : undefined);
    }
  };

  const columns: Column<Company>[] = [
    { key: "name", header: "Company", hideable: false, value: (c) => `${c.name} ${c.subdomain}`, cell: (c) => (
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-control bg-primary-soft text-primary-ink"><Building2 size={18} /></span>
        <div><p className="font-medium text-ink">{c.name}</p><p className="text-helper text-ink-2">{c.subdomain}.easyhr.app</p></div>
      </div>
    ) },
    { key: "plan", header: "Plan", cell: (c) => <Badge tone="info" className="capitalize">{c.plan}</Badge>, value: (c) => c.plan },
    { key: "modules", header: "Modules", cell: (c) => <span className="text-ink-2">{c.enabledModules.length} of {MODULES.length}</span>, value: (c) => c.enabledModules.length },
    { key: "emp", header: "Active employees", cell: (c) => c.usage.activeEmployees, value: (c) => c.usage.activeEmployees, align: "right" },
    { key: "rec", header: "Attendance records", cell: (c) => c.usage.attendanceRecords.toLocaleString(), value: (c) => c.usage.attendanceRecords, align: "right" },
    { key: "created", header: "Created", cell: (c) => fmtDate(c.createdAt), value: (c) => c.createdAt },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} />, value: (c) => c.status },
    { key: "act", header: "", align: "right", hideable: false, cell: (c) => (
      <Popover trigger={(_, t) => <Button variant="ghost" size="icon-sm" icon={Ellipsis} aria-label="Actions" onClick={t} />}>
        {(close) => (
          <MenuList close={close} items={[
            { label: "Impersonate admin", icon: LogIn, onClick: () => impersonate(c), disabled: c.status !== "active" },
            { label: "Enabled modules", icon: Puzzle, onClick: () => setModules(c) },
            c.status === "active"
              ? { label: "Suspend company", icon: Pause, danger: true, onClick: () => patch(c, { status: "suspended" }, "Company suspended") }
              : { label: "Reactivate company", icon: Play, onClick: () => patch(c, { status: "active" }, "Company reactivated") },
          ]} />
        )}
      </Popover>
    ) },
  ];

  return (
    <>
      <PageHeader title="Companies" description="Every tenant on the platform." actions={<Button icon={Plus} onClick={() => setCreate(true)}>Create company</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard loading={!data} icon={Building2} title="Companies" value={data ? items.length : "–"} description={`${items.filter((c) => c.status === "active").length} active`} />
        <KpiCard loading={!data} icon={UsersRound} title="Active employees" value={data ? items.reduce((a, c) => a + c.usage.activeEmployees, 0) : "–"} tone="accent" />
        <KpiCard loading={!data} icon={Activity} title="Attendance records" value={data ? items.reduce((a, c) => a + c.usage.attendanceRecords, 0).toLocaleString() : "–"} tone="info" />
      </div>
      <Card><DataTable rows={data?.items} columns={columns} rowKey={(c) => c.id} loading={loading} error={error} onRetry={reload} exportName="companies" /></Card>
      {create && <CreateCompany onClose={() => setCreate(false)} onDone={() => { setCreate(false); reload(); }} />}
      {modules && <ModulesModal company={modules} onClose={() => setModules(null)} onSave={(m) => { patch(modules, { enabledModules: m }, "Modules updated"); setModules(null); }} />}
    </>
  );
}

function CreateCompany({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", subdomain: "", plan: "standard", adminName: "", adminEmail: "", adminPassword: "" });
  const [mods, setMods] = useState(MODULES.map((m) => m.key));
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const valid = f.name && /^[a-z0-9-]{2,}$/.test(f.subdomain) && f.adminName && f.adminEmail && f.adminPassword.length >= 8;
  const submit = async () => {
    setBusy(true);
    try {
      await api("/master/companies", { method: "POST", json: { ...f, enabledModules: mods } });
      toast.success("Company created", `${f.subdomain}.easyhr.app is ready.`);
      onDone();
    } catch (e) {
      toast.error("Could not create", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Create company" description="Sets up the workspace, default leave types and the first company admin."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button icon={Plus} loading={busy} disabled={!valid} onClick={submit}>Create company</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" required><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Subdomain" required hint={f.subdomain ? `${f.subdomain}.easyhr.app` : "lowercase letters, numbers, hyphens"}>
          <Input value={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
        </Field>
        <Field label="Plan"><Select value={f.plan} onChange={set("plan")}><option value="standard">Standard</option><option value="business">Business</option><option value="enterprise">Enterprise</option></Select></Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-[13px] font-medium text-ink">Enabled modules</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {MODULES.map((m) => <Checkbox key={m.key} label={m.label} checked={mods.includes(m.key)} onChange={() => setMods((xs) => (xs.includes(m.key) ? xs.filter((x) => x !== m.key) : [...xs, m.key]))} />)}
          </div>
        </div>
        <p className="mt-2 text-helper font-semibold uppercase tracking-wide text-ink-3 sm:col-span-2">First company admin</p>
        <Field label="Full name" required><Input value={f.adminName} onChange={set("adminName")} /></Field>
        <Field label="Email" required><Input type="email" value={f.adminEmail} onChange={set("adminEmail")} /></Field>
        <Field label="Initial password" required hint="At least 8 characters. Employee code will be 1001."><Input type="password" value={f.adminPassword} onChange={set("adminPassword")} autoComplete="new-password" /></Field>
      </div>
    </Modal>
  );
}

function ModulesModal({ company, onClose, onSave }: { company: Company; onClose: () => void; onSave: (m: string[]) => void }) {
  const [mods, setMods] = useState(company.enabledModules);
  return (
    <Modal open onClose={onClose} size="sm" title="Enabled modules" description={company.name}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(mods)}>Save</Button></>}>
      <div className="space-y-3">
        {MODULES.map((m) => <Checkbox key={m.key} label={m.label} checked={mods.includes(m.key)} onChange={() => setMods((xs) => (xs.includes(m.key) ? xs.filter((x) => x !== m.key) : [...xs, m.key]))} />)}
      </div>
    </Modal>
  );
}
