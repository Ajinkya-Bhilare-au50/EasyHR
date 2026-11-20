"use client";

import {
  ChevronDown, ChevronUp, Download, FileDown, ListFilter, Maximize2, Minus, Network, Plus, Rows3, Search, X, ChevronsDownUp, ChevronsUpDown,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { qs, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState, ErrorState, useToast } from "../ui/feedback";
import { Bone } from "../ui/skeletons";
import { Checkbox, Field, Input, Select } from "../ui/form";
import { MenuList, Popover } from "../ui/menu";
import { PageHeader } from "../ui/page";
import { Segmented } from "../ui/tabs";
import { useAuth } from "../shell/auth";

type OrgNode = {
  id: string;
  parentId: string | null;
  name: string;
  initials: string;
  photoUrl: string | null;
  employeeCode: string;
  designation: string;
  department: string;
  details: Record<string, string | null>;
  matched: boolean;
  isMe: boolean;
};
type Criteria = { criteria: { key: string; label: string; values: string[] }[]; fields: { key: string; label: string }[] };

export function OrgChartView() {
  const { can } = useAuth();
  const meta = useApi<Criteria>("/orgchart/criteria");
  const [showFilters, setShowFilters] = useState(true);
  const [criteria, setCriteria] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [fields, setFields] = useState<string[]>(["designation", "department"]);
  const [applied, setApplied] = useState({ criteria: "", values: [] as string[], fields: ["designation", "department"] });
  const [view, setView] = useState<"tree" | "flat">("tree");
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [valueQuery, setValueQuery] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const path = `/orgchart${qs({ criteria: applied.criteria, values: applied.values.join("|"), fields: applied.fields.join(",") })}`;
  const { data, loading, error, reload } = useApi<{ nodes: OrgNode[]; fields: { key: string; label: string }[] }>(path);

  const { roots, children, depth } = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const children = new Map<string, OrgNode[]>();
    const roots: OrgNode[] = [];
    for (const n of nodes) {
      if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
      else roots.push(n);
    }
    const depth = new Map<string, number>();
    const walk = (n: OrgNode, d: number) => {
      depth.set(n.id, d);
      (children.get(n.id) ?? []).forEach((c) => walk(c, d + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return { roots, children, depth };
  }, [data]);

  const crit = meta.data?.criteria.find((c) => c.key === criteria);
  const labelFor = (k: string) => data?.fields.find((f) => f.key === k)?.label ?? k;

  const exportAs = async (kind: "png" | "pdf") => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const el = chartRef.current;
      const url = await toPng(el, { backgroundColor: "#ffffff", pixelRatio: 2, width: el.scrollWidth, height: el.scrollHeight, style: { transform: "none" } });
      if (kind === "png") {
        Object.assign(document.createElement("a"), { href: url, download: "org-chart.png" }).click();
      } else {
        const { jsPDF } = await import("jspdf");
        const img = new Image();
        img.src = url;
        await img.decode();
        const landscape = img.width >= img.height;
        const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
        const pw = pdf.internal.pageSize.getWidth() - 48;
        const ph = pdf.internal.pageSize.getHeight() - 72;
        const scale = Math.min(pw / img.width, ph / img.height);
        pdf.setFontSize(12);
        pdf.text("Organisation chart", 24, 30);
        pdf.addImage(url, "PNG", 24, 44, img.width * scale, img.height * scale);
        pdf.save("org-chart.pdf");
      }
      toast.success(`Exported ${kind.toUpperCase()}`);
    } catch (e) {
      toast.error("Export failed", e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const renderTree = (n: OrgNode): React.ReactNode => {
    const kids = children.get(n.id) ?? [];
    const isCollapsed = collapsed.has(n.id);
    return (
      <li key={n.id}>
        <NodeCard node={n} fields={applied.fields} labelFor={labelFor} count={kids.length} collapsed={isCollapsed} onToggle={kids.length ? () => toggle(n.id) : undefined} />
        {kids.length > 0 && !isCollapsed && <ul>{kids.map(renderTree)}</ul>}
      </li>
    );
  };

  const levels = useMemo(() => {
    const m = new Map<number, OrgNode[]>();
    for (const n of data?.nodes ?? []) {
      const d = depth.get(n.id) ?? 0;
      m.set(d, [...(m.get(d) ?? []), n]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [data, depth]);

  return (
    <>
      <PageHeader
        title="Org chart"
        description="Explore reporting lines across the company."
        actions={
          <>
            <Button variant="outline" icon={ListFilter} onClick={() => setShowFilters((s) => !s)}>{showFilters ? "Hide filters" : "Show filters"}</Button>
            {can("orgchart.export") && (
              <Popover trigger={(_, t) => <Button icon={Download} loading={exporting} onClick={t}>Export</Button>}>
                {(close) => (
                  <MenuList close={close} items={[{ label: "Export to PNG", icon: ImageIcon, onClick: () => exportAs("png") }, { label: "Export to PDF", icon: FileDown, onClick: () => exportAs("pdf") }]} />
                )}
              </Popover>
            )}
          </>
        }
      />
      <div className={cn("grid gap-6", showFilters && "lg:grid-cols-[300px_minmax(0,1fr)]")}>
        {showFilters && (
          <Card className="h-fit">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="flex items-center gap-2 text-card text-ink"><ListFilter size={18} className="text-secondary" /> Filters</p>
              <button className="text-ink-3 hover:text-ink lg:hidden" aria-label="Hide filters" onClick={() => setShowFilters(false)}><X size={18} /></button>
            </div>
            <div className="space-y-5 p-5">
              <Field label="Criteria" htmlFor="crit">
                <Select id="crit" value={criteria} onChange={(e) => { setCriteria(e.target.value); setValues([]); setValueQuery(""); }}>
                  <option value="">Whole company</option>
                  {meta.data?.criteria.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
              </Field>
              {crit && (
                <Field label="Criteria values">
                  <div className="rounded-control border border-line">
                    <div className="border-b border-line p-2">
                      <Input icon={Search} className="h-9" placeholder="Search values" value={valueQuery} onChange={(e) => setValueQuery(e.target.value)} />
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto p-3 scrollbar-thin">
                      {crit.values.filter((v) => v.toLowerCase().includes(valueQuery.toLowerCase())).map((v) => (
                        <Checkbox key={v} label={v} checked={values.includes(v)} onChange={() => setValues((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))} />
                      ))}
                    </div>
                  </div>
                </Field>
              )}
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink">Show other details</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {!meta.data && Array.from({ length: 8 }).map((_, i) => <Bone key={i} className="h-5 w-36" />)}
                  {meta.data?.fields.map((f) => (
                    <Checkbox key={f.key} label={f.label} checked={fields.includes(f.key)} onChange={() => setFields((xs) => (xs.includes(f.key) ? xs.filter((x) => x !== f.key) : [...xs, f.key]))} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 border-t border-line pt-4">
                <Button variant="outline" className="flex-1" onClick={() => { setCriteria(""); setValues([]); setFields(["designation", "department"]); setApplied({ criteria: "", values: [], fields: ["designation", "department"] }); }}>Reset</Button>
                <Button className="flex-1" onClick={() => { setApplied({ criteria: values.length ? criteria : "", values, fields }); setCollapsed(new Set()); }}>Show</Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <Segmented value={view} onChange={setView} options={[{ value: "tree", label: "Top-down", icon: Network }, { value: "flat", label: "Flat chart", icon: Rows3 }]} />
            <div className="flex items-center gap-1.5">
              {view === "tree" && (
                <>
                  <Button variant="ghost" size="sm" icon={ChevronsUpDown} onClick={() => setCollapsed(new Set())}>Expand all</Button>
                  <Button variant="ghost" size="sm" icon={ChevronsDownUp} onClick={() => setCollapsed(new Set(roots.flatMap((r) => (children.get(r.id) ?? []).map((c) => c.id))))}>Collapse</Button>
                </>
              )}
              <span className="mx-1 h-6 w-px bg-line" />
              <Button variant="outline" size="icon-sm" icon={Minus} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} />
              <span className="w-12 text-center text-helper font-medium text-ink-2 tabular">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon-sm" icon={Plus} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} />
              <Button variant="outline" size="icon-sm" icon={Maximize2} aria-label="Reset zoom" onClick={() => setZoom(1)} />
            </div>
          </div>
          {applied.values.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-4 py-2.5 text-helper text-ink-2">
              Filtered by <b className="font-medium text-ink">{meta.data?.criteria.find((c) => c.key === applied.criteria)?.label}</b>:
              {applied.values.map((v) => <Badge key={v} tone="info">{v}</Badge>)}
              <span className="text-ink-3">· Managers above each match are kept for context</span>
            </div>
          )}
          <div
            ref={(el) => {
              // Centre the top of the hierarchy horizontally whenever the chart content changes.
              if (el && el.dataset.centredFor !== `${path}|${view}|${data?.nodes.length ?? 0}`) {
                el.dataset.centredFor = `${path}|${view}|${data?.nodes.length ?? 0}`;
                requestAnimationFrame(() => (el.scrollLeft = view === "tree" ? (el.scrollWidth - el.clientWidth) / 2 : 0));
              }
            }}
            className="h-[calc(100vh-300px)] min-h-[480px] overflow-auto bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:18px_18px] scrollbar-thin">
            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : loading && !data ? (
              <div className="flex flex-col items-center gap-10 p-10" aria-busy aria-label="Loading org chart">
                <Bone className="h-24 w-56 rounded-card" />
                <div className="flex gap-8">{Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-24 w-56 rounded-card" />)}</div>
                <div className="flex gap-8">{Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-24 w-48 rounded-card" />)}</div>
              </div>
            ) : !data?.nodes.length ? (
              <EmptyState icon={Network} title="No employees match" description="Try another criteria value." />
            ) : (
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} className="w-max min-w-full">
                <div ref={chartRef} className="w-max min-w-full bg-transparent p-8">
                  {view === "tree" ? (
                    <div className="org-tree"><ul>{roots.map(renderTree)}</ul></div>
                  ) : (
                    <div className="space-y-6">
                      {levels.map(([lvl, nodes]) => (
                        <div key={lvl}>
                          <p className="mb-3 text-helper font-semibold uppercase tracking-wide text-ink-3">Level {lvl + 1} · {nodes.length} {nodes.length === 1 ? "person" : "people"}</p>
                          <div className="flex flex-wrap gap-4">
                            {nodes.map((n) => <NodeCard key={n.id} node={n} fields={applied.fields} labelFor={labelFor} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function NodeCard({
  node: n,
  fields,
  labelFor,
  count,
  collapsed,
  onToggle,
}: {
  node: OrgNode;
  fields: string[];
  labelFor: (k: string) => string;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const extra = fields.filter((f) => f !== "designation");
  return (
    <div className="relative">
      <Link
        href={`/profile/${n.id}`}
        className={cn(
          "block w-56 rounded-card border bg-surface p-3.5 text-left shadow-card transition-shadow hover:shadow-raised",
          n.isMe ? "border-secondary ring-2 ring-secondary/15" : n.matched ? "border-line" : "border-dashed border-line-strong opacity-75",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Avatar name={n.name} initials={n.initials} src={n.photoUrl} />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink">{n.name}</p>
            <p className="truncate text-helper text-ink-2">{fields.includes("designation") ? n.designation : n.employeeCode}</p>
          </div>
        </div>
        {extra.length > 0 && (
          <dl className="mt-3 space-y-1 border-t border-line pt-2.5">
            {extra.map((f) => (
              <div key={f} className="flex justify-between gap-2 text-helper">
                <dt className="shrink-0 text-ink-3">{labelFor(f)}</dt>
                <dd className="truncate text-right font-medium text-ink">{n.details[f] ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {n.isMe && <span className="absolute -top-2 left-3 rounded-full bg-secondary px-2 py-px text-[10px] font-semibold text-white">You</span>}
      </Link>
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${n.name}` : `Collapse ${n.name}`}
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink-2 shadow-card hover:text-ink"
        >
          {count}
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      )}
    </div>
  );
}
