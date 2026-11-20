"use client";

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Bone } from "./skeletons";

/**
 * Searchable employee combobox.
 * source="lookup" searches all colleagues (backup employee); source="team" lists the caller's reportees.
 */
export function EmployeePicker({
  value,
  onChange,
  source = "lookup",
  placeholder = "Select employee",
  invalid,
  id,
  allowClear,
}: {
  value: UserBrief | null;
  onChange: (u: UserBrief | null) => void;
  source?: "lookup" | "team";
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; items: UserBrief[] }>({ q: "\u0000", items: [] });
  const ref = useRef<HTMLDivElement>(null);
  const loading = result.q !== q;
  const items = result.items;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(async () => {
      const path = source === "team" ? "/team" : `/employees/lookup?q=${encodeURIComponent(q)}`;
      try {
        const res = await api<{ items: UserBrief[] }>(path);
        const needle = q.toLowerCase();
        const list = source === "team" && needle ? res.items.filter((u) => `${u.name} ${u.employeeCode}`.toLowerCase().includes(needle)) : res.items;
        if (alive) setResult({ q, items: list });
      } catch {
        if (alive) setResult({ q, items: [] });
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, source]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        data-invalid={invalid || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-input w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-left text-body transition-colors hover:border-line-strong",
          "focus:border-secondary focus:shadow-focus focus:outline-none data-[invalid=true]:border-danger",
        )}
      >
        {value ? (
          <>
            <Avatar name={value.name} initials={value.initials} size="xs" />
            <span className="truncate text-ink">{value.name}</span>
            <span className="truncate text-helper text-ink-3">{value.employeeCode}</span>
          </>
        ) : (
          <span className="text-ink-3">{placeholder}</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-ink-3">
          {allowClear && value && (
            <X
              size={15}
              className="hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronsUpDown size={16} />
        </span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1.5 w-full min-w-64 animate-slide-up rounded-card border border-line bg-surface shadow-raised">
          <div className="relative border-b border-line">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or code"
              className="h-10 w-full bg-transparent pl-9 pr-3 text-body outline-none placeholder:text-ink-3"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            {loading && items.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-2.5 px-2.5 py-2" aria-hidden>
                  <Bone className="size-8 shrink-0 rounded-full" />
                  <span className="flex-1 space-y-1.5">
                    <Bone className="h-3.5 w-2/3" />
                    <Bone className="h-3 w-1/2" />
                  </span>
                </li>
              ))
            ) : items.length === 0 ? (
              <li className="px-3 py-4 text-center text-body text-ink-2">No employees found</li>
            ) : (
              items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value?.id === u.id}
                    onClick={() => {
                      onChange(u);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-neutral-soft"
                  >
                    <Avatar name={u.name} initials={u.initials} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-ink">{u.name}</span>
                      <span className="block truncate text-helper text-ink-2">
                        {u.employeeCode} · {u.designation}
                      </span>
                    </span>
                    {value?.id === u.id && <Check size={16} className="text-secondary" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
