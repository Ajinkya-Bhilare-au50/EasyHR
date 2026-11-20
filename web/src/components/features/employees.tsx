"use client";

import { RequirePermission } from "../shell/guard";
import { Pencil, Plus, Save, UserRoundPlus, UsersRound, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { PersonCell } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { useToast } from "../ui/feedback";
import { Checkbox, Field, Input, Select } from "../ui/form";
import { KpiCard, PageHeader } from "../ui/page";
import { Segmented } from "../ui/tabs";

type Employee = UserBrief & {
  manager: UserBrief | null;
  roles: { id: string; name: string }[];
  status: string;
  joinedOn: string | null;
  dateOfBirth: string | null;
  tenure: string | null;
  division: string | null; region: string | null; branch: string | null; grade: string | null;
  businessSegment: string | null; businessVertical: string | null; product: string | null; costCentre: string | null;
  gender: string | null; phone: string | null; bloodGroup: string | null; address: string | null;
};
type Role = { id: string; name: string; system: boolean };

const TEXT_FIELDS: [keyof Employee, string][] = [
  ["designation", "Designation"], ["department", "Department"], ["division", "Division"], ["region", "Region"],
  ["branch", "Branch"], ["grade", "Grade"], ["businessSegment", "Business segment"], ["businessVertical", "Business vertical"],
  ["product", "Product"], ["costCentre", "Cost centre"], ["phone", "Phone"],
];

export function EmployeesView() {
  return <RequirePermission any={["employees.manage"]}><EmployeesViewInner /></RequirePermission>;
}

function EmployeesViewInner() {
  const [status, setStatus] = useState<"active" | "exited" | "">("active");
  const { data, loading, error, reload } = useApi<{ items: Employee[] }>(`/admin/employees${status ? `?status=${status}` : ""}`);
  const all = useApi<{ items: Employee[] }>("/admin/employees?status=active");
  const roles = useApi<{ items: Role[] }>("/admin/roles");
  const [edit, setEdit] = useState<Employee | "new" | null>(null);
  const router = useRouter();
  const list = data?.items ?? [];
  const depts = new Set(all.data?.items.map((e) => e.department).filter(Boolean));
  const managers = new Set(all.data?.items.map((e) => e.manager?.id).filter(Boolean));

  const columns: Column<Employee>[] = [
    { key: "emp", header: "Employee", cell: (e) => <PersonCell user={e} />, value: (e) => `${e.name} ${e.employeeCode} ${e.email}`, hideable: false },
    { key: "dept", header: "Department", cell: (e) => e.department, value: (e) => e.department },
    { key: "branch", header: "Branch", cell: (e) => e.branch, value: (e) => e.branch },
    { key: "mgr", header: "Manager", cell: (e) => e.manager?.name ?? "—", value: (e) => e.manager?.name },
    { key: "roles", header: "Roles", cell: (e) => <div className="flex flex-wrap gap-1">{e.roles.map((r) => <Badge key={r.id} tone={r.name === "Employee" ? "neutral" : "info"}>{r.name}</Badge>)}</div>, value: (e) => e.roles.map((r) => r.name).join(", ") },
    { key: "joined", header: "Joined", cell: (e) => fmtDate(e.joinedOn), value: (e) => e.joinedOn },
    { key: "email", header: "Email", cell: (e) => e.email, value: (e) => e.email, defaultHidden: true },
    { key: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} />, value: (e) => e.status },
    {
      key: "act", header: "Action", align: "right", hideable: false,
      cell: (e) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View profile" onClick={() => router.push(`/profile/${e.id}`)} />
          <Button variant="ghost" size="icon-sm" icon={Pencil} aria-label="Edit" onClick={() => setEdit(e)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Employees" description="Add people, set reporting lines and assign roles." actions={<Button icon={UserRoundPlus} onClick={() => setEdit("new")}>Add employee</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard loading={!all.data} icon={UsersRound} title="Active employees" value={all.data?.items.length ?? "–"} tone="primary" />
        <KpiCard loading={!all.data} icon={UsersRound} title="Departments" value={all.data ? depts.size : "–"} tone="accent" />
        <KpiCard loading={!all.data} icon={UsersRound} title="People managers" value={all.data ? managers.size : "–"} tone="info" />
      </div>
      <Card>
        <DataTable
          rows={list}
          columns={columns}
          rowKey={(e) => e.id}
          loading={loading}
          error={error}
          onRetry={reload}
          exportName="employees"
          searchPlaceholder="Search name, code or email"
          toolbar={<Segmented value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "exited", label: "Exited" }, { value: "", label: "All" }]} />}
        />
      </Card>
      {edit && (
        <EmployeeForm
          employee={edit === "new" ? null : edit}
          roles={roles.data?.items ?? []}
          people={all.data?.items ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
            all.reload();
          }}
        />
      )}
    </>
  );
}

function EmployeeForm({ employee, roles, people, onClose, onSaved }: { employee: Employee | null; roles: Role[]; people: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {
      employeeCode: employee?.employeeCode ?? "", name: employee?.name ?? "", email: employee?.email ?? "", password: "",
      managerId: employee?.manager?.id ?? "", joinedOn: employee?.joinedOn ?? "", dateOfBirth: employee?.dateOfBirth ?? "",
      gender: employee?.gender ?? "", bloodGroup: employee?.bloodGroup ?? "", address: employee?.address ?? "", status: employee?.status ?? "active", annualCtc: "",
    };
    for (const [k] of TEXT_FIELDS) base[k as string] = (employee?.[k] as string) ?? "";
    return base;
  });
  const [roleIds, setRoleIds] = useState<string[]>(employee?.roles.map((r) => r.id) ?? roles.filter((r) => r.name === "Employee").map((r) => r.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const toast = useToast();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.employeeCode.trim()) e.employeeCode = "Required";
    if (!f.name.trim()) e.name = "Required";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email";
    if (!employee && f.password.length < 8) e.password = "At least 8 characters";
    if (employee && f.password && f.password.length < 8) e.password = "At least 8 characters";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body: Record<string, unknown> = { roleIds };
    for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
    body.status = f.status;
    body.annualCtc = f.annualCtc ? Number(f.annualCtc) : null;
    try {
      await api(employee ? `/admin/employees/${employee.id}` : "/admin/employees", { method: employee ? "PUT" : "POST", json: body });
      toast.success(employee ? "Employee updated" : "Employee added");
      onSaved();
    } catch (x) {
      toast.error("Could not save", x instanceof Error ? x.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={employee ? `Edit ${employee.name}` : "Add employee"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button icon={employee ? Save : Plus} loading={busy} onClick={save}>{employee ? "Save changes" : "Add employee"}</Button></>}
    >
      <div className="space-y-6">
        <section>
          <p className="mb-3 text-helper font-semibold uppercase tracking-wide text-ink-3">Account</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee code" required error={err.employeeCode}><Input value={f.employeeCode} onChange={set("employeeCode")} invalid={!!err.employeeCode} /></Field>
            <Field label="Full name" required error={err.name}><Input value={f.name} onChange={set("name")} invalid={!!err.name} /></Field>
            <Field label="Work email" required error={err.email}><Input type="email" value={f.email} onChange={set("email")} invalid={!!err.email} /></Field>
            <Field label={employee ? "Reset password" : "Initial password"} required={!employee} error={err.password} hint={employee ? "Leave blank to keep the current password" : undefined}>
              <Input type="password" value={f.password} onChange={set("password")} invalid={!!err.password} autoComplete="new-password" />
            </Field>
            <Field label="Reports to">
              <Select value={f.managerId} onChange={set("managerId")}>
                <option value="">No manager (top of org)</option>
                {people.filter((p) => p.id !== employee?.id).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.employeeCode}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onChange={set("status")}><option value="active">Active</option><option value="exited">Exited</option></Select>
            </Field>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-medium text-ink">Roles</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {roles.map((r) => (
                <Checkbox key={r.id} label={r.name} checked={roleIds.includes(r.id)} onChange={() => setRoleIds((xs) => (xs.includes(r.id) ? xs.filter((x) => x !== r.id) : [...xs, r.id]))} />
              ))}
            </div>
          </div>
        </section>
        <section>
          <p className="mb-3 text-helper font-semibold uppercase tracking-wide text-ink-3">Job and organisation</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEXT_FIELDS.filter(([k]) => k !== "phone").map(([k, label]) => (
              <Field key={k as string} label={label}><Input value={f[k as string]} onChange={set(k as string)} /></Field>
            ))}
            <Field label="Date of joining"><Input type="date" value={f.joinedOn} onChange={set("joinedOn")} /></Field>
            {!employee && <Field label="Annual CTC" hint="Optional, INR"><Input type="number" min={0} value={f.annualCtc} onChange={set("annualCtc")} /></Field>}
          </div>
        </section>
        <section>
          <p className="mb-3 text-helper font-semibold uppercase tracking-wide text-ink-3">Personal</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} /></Field>
            <Field label="Gender"><Select value={f.gender} onChange={set("gender")}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></Select></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}
