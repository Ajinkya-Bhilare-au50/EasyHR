"use client";

import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, FileDown, Printer, Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { EmptyState, ErrorState, Skeleton } from "./feedback";
import { Checkbox, Input, Select } from "./form";
import { Popover } from "./menu";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting, search and CSV export. Omit to make the column unsortable. */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  hideable?: boolean;
  defaultHidden?: boolean;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  searchPlaceholder = "Search…",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  toolbar,
  exportName,
  pageSize: initialPageSize = 10,
  searchable = true,
  printable = true,
  initialSort,
}: {
  rows: T[] | null | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: React.ReactNode;
  exportName?: string;
  pageSize?: number;
  searchable?: boolean;
  printable?: boolean;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));

  const visible = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((r) => columns.some((c) => c.value && String(c.value(r) ?? "").toLowerCase().includes(needle)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        const v = col.value;
        list = [...list].sort((a, b) => {
          const x = v(a) ?? "";
          const y = v(b) ?? "";
          const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, q, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const exportCsv = () => {
    const cols = visible.filter((c) => c.value);
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c.header)).join(","), ...filtered.map((r) => cols.map((c) => esc(c.value!(r))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${exportName ?? "export"}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const cols = visible;
    const html = `<html><head><title>${exportName ?? "EasyHR"}</title><style>
      body{font-family:Inter,system-ui,sans-serif;color:#172033;padding:24px}h1{font-size:18px;margin:0 0 16px}
      table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
      th{background:#f8fafc;color:#64748b;font-weight:600}</style></head><body><h1>${exportName ?? ""}</h1><table><thead><tr>
      ${cols.map((c) => `<th>${c.header}</th>`).join("")}</tr></thead><tbody>
      ${filtered.map((r) => `<tr>${cols.map((c) => `<td>${String(c.value ? c.value(r) ?? "" : "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}
      </tbody></table></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-end">
        {toolbar && <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">{toolbar}</div>}
        <div className={cn("flex flex-wrap items-center gap-2", !toolbar && "flex-1")}>
          {searchable && (
            <div className={cn("min-w-0 flex-1", toolbar ? "lg:w-60 lg:flex-none" : "sm:max-w-xs")}>
              <Input
                icon={Search}
                placeholder={searchPlaceholder}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                aria-label="Search table"
              />
            </div>
          )}
          <div className={cn("flex items-center gap-2", !toolbar && "ml-auto")}>
            <Popover
              trigger={(_, toggle) => (
                <Button variant="outline" size="icon" icon={Columns3} onClick={toggle} aria-label="Show or hide columns" title="Columns" />
              )}
            >
              {() => (
                <div className="w-56 p-3">
                  <p className="mb-2 text-helper font-semibold uppercase tracking-wide text-ink-3">Columns</p>
                  <div className="flex flex-col gap-2">
                    {columns.filter((c) => c.hideable !== false).map((c) => (
                      <Checkbox
                        key={c.key}
                        label={c.header}
                        checked={!hidden.has(c.key)}
                        onChange={() =>
                          setHidden((h) => {
                            const n = new Set(h);
                            if (n.has(c.key)) n.delete(c.key);
                            else n.add(c.key);
                            return n;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </Popover>
            {printable && <Button variant="outline" size="icon" icon={Printer} onClick={print} aria-label="Print" title="Print" />}
            {exportName && <Button variant="outline" size="icon" icon={FileDown} onClick={exportCsv} aria-label="Export CSV" title="Export CSV" />}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[640px] border-collapse text-body">
            <thead>
              <tr className="border-b border-line bg-subtle">
                {visible.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "h-11 whitespace-nowrap px-4 text-helper font-semibold uppercase tracking-wide text-ink-2",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {c.value ? (
                      <button onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-ink", sort?.key === c.key && "text-ink")}>
                        {c.header}
                        {sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} className="opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {visible.map((c) => (
                        <td key={c.key} className="h-14 px-4">
                          <Skeleton className="h-4 w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : slice.map((r) => (
                    <tr key={rowKey(r)} className="border-b border-line transition-colors last:border-0 hover:bg-subtle/70">
                      {visible.map((c) => (
                        <td
                          key={c.key}
                          className={cn(
                            "h-14 px-4 py-2 align-middle",
                            c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                            c.className,
                          )}
                        >
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <EmptyState title={q ? "No matching records" : emptyTitle} description={q ? "Try a different search term." : emptyDescription} />}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
          <p className="text-helper text-ink-2">
            Showing <span className="font-medium text-ink">{current * pageSize + 1}</span>–
            <span className="font-medium text-ink">{Math.min((current + 1) * pageSize, filtered.length)}</span> of{" "}
            <span className="font-medium text-ink">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <div className="w-[88px]">
              <Select
                aria-label="Rows per page"
                className="h-8 text-[13px]"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" size="icon-sm" icon={ChevronLeft} disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page" />
            <span className="min-w-14 text-center text-helper text-ink-2 tabular">
              {current + 1} / {pages}
            </span>
            <Button variant="outline" size="icon-sm" icon={ChevronRight} disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page" />
          </div>
        </div>
      )}
    </div>
  );
}
