"use client";

import { RequirePermission } from "../shell/guard";
import { FileClock, Palmtree, Eye } from "lucide-react";
import { useState } from "react";
import { useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { fmtDateTime, titleCase } from "@/lib/utils";
import { PersonCell } from "../ui/avatar";
import { Badge, type Tone } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DataTable, type Column } from "../ui/data-table";
import { Modal } from "../ui/dialog";
import { Field, Select } from "../ui/form";
import { PageHeader } from "../ui/page";
import { Tabs, useTabParam, type TabItem } from "../ui/tabs";
import { useAuth } from "../shell/auth";
import { HolidayReports } from "./holiday";

type Audit = { id: string; actor: UserBrief | null; action: string; entity: string; entityId: string | null; oldValue: unknown; newValue: unknown; createdAt: string };

export function ReportsView() {
  return <RequirePermission any={["holiday.reports", "audit.view"]}><ReportsViewInner /></RequirePermission>;
}

function ReportsViewInner() {
  const { can } = useAuth();
  const items: TabItem[] = [
    ...(can("holiday.reports") ? [{ key: "holiday", label: "Holiday report", icon: Palmtree }] : []),
    ...(can("audit.view") ? [{ key: "audit", label: "Audit log", icon: FileClock }] : []),
  ];
  const [tab, setTab] = useTabParam(items);
  return (
    <>
      <PageHeader title="Reports" description="Usage reports and a full trail of every change." />
      <Tabs items={items} value={tab} onChange={setTab} className="mb-6" />
      {tab === "holiday" && <HolidayReports />}
      {tab === "audit" && <AuditLog />}
    </>
  );
}

function toneFor(action: string): Tone {
  if (action.endsWith("approved") || action.endsWith("created")) return "success";
  if (action.endsWith("rejected") || action.endsWith("deleted") || action.endsWith("locked")) return "danger";
  if (action.endsWith("cancelled")) return "neutral";
  if (action.includes("impersonat")) return "warning";
  return "info";
}

function AuditLog() {
  const [entity, setEntity] = useState("");
  const { data, loading, error, reload } = useApi<{ items: Audit[] }>(`/admin/audit-logs${entity ? `?entity=${entity}` : ""}`);
  const [detail, setDetail] = useState<Audit | null>(null);
  const columns: Column<Audit>[] = [
    { key: "at", header: "When", cell: (a) => <span className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</span>, value: (a) => a.createdAt },
    { key: "actor", header: "Actor", cell: (a) => (a.actor ? <PersonCell user={a.actor} size="xs" /> : "System"), value: (a) => a.actor?.name },
    { key: "action", header: "Action", cell: (a) => <Badge tone={toneFor(a.action)}>{a.action}</Badge>, value: (a) => a.action },
    { key: "entity", header: "Entity", cell: (a) => titleCase(a.entity), value: (a) => a.entity },
    { key: "act", header: "", align: "right", hideable: false, cell: (a) => <Button variant="ghost" size="icon-sm" icon={Eye} aria-label="View change" onClick={() => setDetail(a)} /> },
  ];
  return (
    <Card>
      <DataTable rows={data?.items} columns={columns} rowKey={(a) => a.id} loading={loading} error={error} onRetry={reload} exportName="audit-log" pageSize={25}
        initialSort={{ key: "at", dir: "desc" }}
        toolbar={
          <Field label="Entity" className="sm:w-56">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">All</option>
              {["rationalization", "leave_request", "holiday_request", "user", "company_settings", "leave_type", "holiday", "role", "payroll_lock"].map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}
            </Select>
          </Field>
        } />
      {detail && (
        <Modal open onClose={() => setDetail(null)} size="lg" title={detail.action} description={`${detail.actor?.name ?? "System"} · ${fmtDateTime(detail.createdAt)}`}>
          <div className="grid gap-4 md:grid-cols-2">
            {(["oldValue", "newValue"] as const).map((k) => (
              <div key={k}>
                <p className="mb-2 text-helper font-semibold uppercase tracking-wide text-ink-3">{k === "oldValue" ? "Before" : "After"}</p>
                <pre className="max-h-96 overflow-auto rounded-control border border-line bg-subtle p-3 text-[12px] leading-5 text-ink scrollbar-thin">{detail[k] ? JSON.stringify(detail[k], null, 2) : "—"}</pre>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}
