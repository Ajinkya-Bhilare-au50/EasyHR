"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Click-to-open popover anchored to its trigger. */
export function Popover({
  trigger,
  children,
  align = "right",
  className,
}: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-2 animate-slide-up rounded-card border border-line bg-surface shadow-raised",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export type MenuAction = { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean };

export function MenuList({ items, close }: { items: MenuAction[]; close: () => void }) {
  return (
    <div className="min-w-44 p-1.5" role="menu">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.label}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              close();
              it.onClick();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-body disabled:opacity-40",
              it.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-neutral-soft",
            )}
          >
            {Icon && <Icon size={16} className={it.danger ? "" : "text-ink-2"} />}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
