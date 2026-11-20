"use client";

import {
  BadgeIndianRupee, Briefcase, Building2, CalendarDays, FileText, Lock, Mail, MapPin, Pencil, Phone, UserRound, UsersRound,
  FileCheck2, IdCard, Network, Save,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader, InfoItem } from "../ui/card";
import { Modal } from "../ui/dialog";
import { EmptyState, ErrorState, useToast } from "../ui/feedback";
import { ProfileSkeleton } from "../ui/skeletons";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Tabs, useTabParam, type TabItem } from "../ui/tabs";
import { DocumentsCard, type DocStatus } from "./onboarding-docs";

type Profile = {
  user: UserBrief & { status: string };
  canViewPrivate: boolean;
  professional: {
    employeeCode: string; designation: string; department: string; division: string; region: string; branch: string; grade: string;
    businessSegment: string; businessVertical: string; product: string; costCentre: string; joinedOn: string; tenure: string;
    manager: UserBrief | null; workEmail: string; summary: Record<string, string>; reportees: UserBrief[];
  };
  personal?: { dateOfBirth: string; gender: string; phone: string; personalEmail: string; bloodGroup: string; maritalStatus: string; address: string };
  otherDetails?: Record<string, string>;
  documents?: DocStatus;
  compensation?: { effectiveFrom: string; annualCtc: number; currency: string; components: Record<string, number> }[];
};

export function ProfileView() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ?? "me";
  const { data, error, reload } = useApi<Profile>(`/profile/${id}`);
  const tabs: TabItem[] = [
    { key: "other", label: "Other details", icon: FileText },
    { key: "professional", label: "Professional summary", icon: Briefcase },
    { key: "personal", label: "Personal summary", icon: UserRound },
    ...(data?.documents ? [{ key: "documents", label: "Documents", icon: FileCheck2 }] : []),
    ...(data?.compensation ? [{ key: "compensation", label: "Compensation", icon: BadgeIndianRupee }] : []),
  ];
  const [tab, setTab] = useTabParam(tabs, "professional");

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  if (!data) return <ProfileSkeleton />;
  const p = data.professional;
  const isMe = id === "me";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-24 bg-primary bg-[radial-gradient(circle_at_85%_20%,rgba(94,234,212,0.18),transparent_45%)]" />
        <div className="flex flex-col gap-5 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <Avatar name={data.user.name} initials={data.user.initials} size="xl" className="-mt-10 ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-page text-ink">{data.user.name}</h1>
              <StatusBadge status={data.user.status} />
            </div>
            <p className="text-body text-ink-2">{p.designation} · {p.department}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-body text-ink-2 sm:flex sm:flex-wrap">
            <span className="inline-flex items-center gap-1.5"><IdCard size={16} className="text-ink-3" />{p.employeeCode}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin size={16} className="text-ink-3" />{p.branch}</span>
            <span className="inline-flex items-center gap-1.5"><Mail size={16} className="text-ink-3" />{p.workEmail}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={16} className="text-ink-3" />{p.tenure ?? "—"}</span>
          </div>
        </div>
      </Card>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "other" && (
        data.otherDetails ? (
          <Card>
            <CardHeader icon={FileText} title="Other details" description="Additional information on record" />
            <CardBody>
              {Object.keys(data.otherDetails).length === 0 ? (
                <EmptyState title="No additional details" />
              ) : (
                <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(data.otherDetails).map(([k, v]) => <InfoItem key={k} label={k} value={v} />)}
                </dl>
              )}
            </CardBody>
          </Card>
        ) : <Restricted />
      )}

      {tab === "professional" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader icon={Briefcase} title="Professional summary" />
            <CardBody>
              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <InfoItem label="Employee code" value={p.employeeCode} />
                <InfoItem label="Designation" value={p.designation} />
                <InfoItem label="Grade" value={p.grade} />
                <InfoItem label="Department" value={p.department} />
                <InfoItem label="Division" value={p.division} />
                <InfoItem label="Region" value={p.region} />
                <InfoItem label="Branch" value={p.branch} />
                <InfoItem label="Business segment" value={p.businessSegment} />
                <InfoItem label="Business vertical" value={p.businessVertical} />
                <InfoItem label="Product" value={p.product} />
                <InfoItem label="Cost centre" value={p.costCentre} />
                <InfoItem label="Date of joining" value={fmtDate(p.joinedOn)} />
                {Object.entries(p.summary ?? {}).map(([k, v]) => <InfoItem key={k} label={k} value={v} />)}
              </dl>
            </CardBody>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader icon={Network} title="Reporting" />
              <CardBody className="space-y-4">
                <div>
                  <p className="mb-2 text-helper text-ink-2">Reports to</p>
                  {p.manager ? <PersonLink u={p.manager} /> : <p className="text-body text-ink-2">—</p>}
                </div>
                <div>
                  <p className="mb-2 text-helper text-ink-2">Direct reportees ({p.reportees.length})</p>
                  {p.reportees.length === 0 ? <p className="text-body text-ink-2">None</p> : <div className="space-y-2">{p.reportees.map((r) => <PersonLink key={r.id} u={r} />)}</div>}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "personal" && (data.personal ? <Personal data={data.personal} editable={isMe} onSaved={reload} /> : <Restricted />)}

      {tab === "documents" && data.documents && <DocumentsCard docs={data.documents} />}

      {tab === "compensation" && data.compensation && <Compensation items={data.compensation} />}
    </div>
  );
}

function PersonLink({ u }: { u: UserBrief }) {
  return (
    <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 rounded-control p-1.5 -m-1.5 hover:bg-subtle">
      <Avatar name={u.name} initials={u.initials} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-body font-medium text-ink">{u.name}</span>
        <span className="block truncate text-helper text-ink-2">{u.designation}</span>
      </span>
    </Link>
  );
}

function Restricted() {
  return (
    <Card>
      <EmptyState icon={Lock} title="Private information" description="Only the employee, their managers and HR can see this section." />
    </Card>
  );
}

function Personal({ data, editable, onSaved }: { data: NonNullable<Profile["personal"]>; editable: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(data);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true);
    try {
      await api("/profile/me/personal", {
        method: "PUT",
        json: { phone: form.phone, personalEmail: form.personalEmail, address: form.address, bloodGroup: form.bloodGroup, maritalStatus: form.maritalStatus },
      });
      toast.success("Profile updated");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader icon={UserRound} title="Personal summary" action={editable && <Button variant="outline" size="sm" icon={Pencil} onClick={() => { setForm(data); setOpen(true); }}>Edit</Button>} />
      <CardBody>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Date of birth" value={fmtDate(data.dateOfBirth)} />
          <InfoItem label="Gender" value={data.gender} />
          <InfoItem label="Blood group" value={data.bloodGroup} />
          <InfoItem label="Marital status" value={data.maritalStatus} />
          <InfoItem label="Phone" value={data.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} className="text-ink-3" />{data.phone}</span>} />
          <InfoItem label="Personal email" value={data.personalEmail} />
          <InfoItem label="Address" value={data.address} className="sm:col-span-2 lg:col-span-3" />
        </dl>
      </CardBody>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit personal details"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button icon={Save} loading={busy} onClick={save}>Save changes</Button></>}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Phone" htmlFor="ph"><Input id="ph" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Personal email" htmlFor="pe"><Input id="pe" type="email" value={form.personalEmail ?? ""} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></Field>
          <Field label="Blood group" htmlFor="bg">
            <Select id="bg" value={form.bloodGroup ?? ""} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
              <option value="">Select</option>
              {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((b) => <option key={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label="Marital status" htmlFor="ms">
            <Select id="ms" value={form.maritalStatus ?? ""} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
              <option value="">Select</option>
              {["Single", "Married", "Other"].map((b) => <option key={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label="Address" htmlFor="ad" className="sm:col-span-2"><Textarea id="ad" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
      </Modal>
    </Card>
  );
}

function Compensation({ items }: { items: NonNullable<Profile["compensation"]> }) {
  if (!items.length) return <Card><EmptyState icon={BadgeIndianRupee} title="No compensation on record" /></Card>;
  const cur = items[0];
  const total = Object.values(cur.components).reduce((a, b) => a + b, 0) || cur.annualCtc;
  const colors = ["bg-primary", "bg-secondary", "bg-accent", "bg-warning", "bg-info"];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader icon={BadgeIndianRupee} title="Annual CTC" description={`Effective ${fmtDate(cur.effectiveFrom)}`} />
        <CardBody>
          <p className="text-kpi text-ink tabular">{fmtMoney(cur.annualCtc, cur.currency)}</p>
          <p className="mt-1 text-helper text-ink-2">≈ {fmtMoney(cur.annualCtc / 12, cur.currency)} per month</p>
          <Badge tone="neutral" icon={Lock} className="mt-4">Visible only to you and HR</Badge>
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader icon={Building2} title="Salary structure" />
        <CardBody>
          <div className="mb-5 flex h-3 overflow-hidden rounded-full">
            {Object.entries(cur.components).map(([k, v], i) => (
              <div key={k} className={colors[i % colors.length]} style={{ width: `${(v / total) * 100}%` }} title={k} />
            ))}
          </div>
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-line text-left text-helper uppercase tracking-wide text-ink-2">
                <th className="pb-2 font-semibold">Component</th>
                <th className="pb-2 text-right font-semibold">Annual</th>
                <th className="pb-2 text-right font-semibold">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(cur.components).map(([k, v], i) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="py-2.5"><span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${colors[i % colors.length]}`} />{k}</span></td>
                  <td className="py-2.5 text-right tabular">{fmtMoney(v, cur.currency)}</td>
                  <td className="py-2.5 text-right tabular text-ink-2">{fmtMoney(v / 12, cur.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      {items.length > 1 && (
        <Card className="lg:col-span-3">
          <CardHeader icon={UsersRound} title="Revision history" />
          <ul>
            {items.map((c) => (
              <li key={c.effectiveFrom} className="flex justify-between border-b border-line px-5 py-3 last:border-0">
                <span>{fmtDate(c.effectiveFrom)}</span>
                <span className="font-medium tabular">{fmtMoney(c.annualCtc, c.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
