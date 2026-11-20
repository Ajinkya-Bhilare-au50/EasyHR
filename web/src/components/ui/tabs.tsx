"use client";

import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: string; icon?: LucideIcon; count?: number };

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (k: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0", className)}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-line">
        {items.map((t) => {
          const active = t.key === value;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative -mb-px flex h-11 items-center gap-2 border-b-2 px-3.5 text-body font-medium transition-colors",
                active ? "border-secondary text-ink" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {Icon && <Icon size={17} className={active ? "text-secondary" : "text-ink-3"} />}
              {t.label}
              {!!t.count && (
                <span className={cn("rounded-full px-1.5 py-px text-[11px] font-semibold", active ? "bg-secondary text-white" : "bg-neutral-soft text-ink-2")}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tab state kept in ?tab= so sub-tabs are linkable (e.g. from notifications). */
export function useTabParam(items: TabItem[], fallback?: string): [string, (k: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = sp.get("tab");
  const value = items.some((i) => i.key === raw) ? (raw as string) : fallback ?? items[0]?.key;
  const set = (k: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("tab", k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return [value, set];
}

/** Segmented control for small view switches (e.g. Attendance data / Raw data). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-control border border-line bg-subtle p-0.5", className)}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors",
              value === o.value ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {Icon && <Icon size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
