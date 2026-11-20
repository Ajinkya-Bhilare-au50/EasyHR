"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, isoDate } from "@/lib/utils";
import { Button } from "./button";

export type CalendarEvent = { date: string; label: string; tone: "holiday" | "optional" | "leave" | "pending" };

const toneDot = {
  holiday: "bg-accent",
  optional: "bg-secondary",
  leave: "bg-success",
  pending: "bg-warning",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthCalendar({
  month,
  onMonthChange,
  events = [],
  range,
  onSelect,
  weekOffs = [5, 6],
  compact,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  events?: CalendarEvent[];
  range?: { from?: string; to?: string };
  onSelect?: (date: string) => void;
  weekOffs?: number[];
  compact?: boolean;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const today = isoDate(new Date());
  const byDate = new Map<string, CalendarEvent[]>();
  events.forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-card text-ink">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" icon={ChevronLeft} aria-label="Previous month" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <Button variant="ghost" size="icon-sm" icon={ChevronRight} aria-label="Next month" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-helper font-medium text-ink-3">
            {compact ? d[0] : d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoDate(d);
          const evs = byDate.get(iso) ?? [];
          const inRange = range?.from && range?.to && iso >= range.from && iso <= range.to;
          const isEdge = iso === range?.from || iso === range?.to;
          const weekend = weekOffs.includes((d.getDay() + 6) % 7);
          return (
            <button
              key={i}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(iso)}
              title={evs.map((e) => e.label).join(", ") || undefined}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-control text-body transition-colors",
                compact ? "h-9" : "h-11",
                onSelect && "cursor-pointer hover:bg-neutral-soft",
                weekend && !inRange && "text-ink-3",
                inRange && "bg-secondary-soft text-secondary",
                isEdge && "bg-secondary font-semibold text-white hover:bg-secondary",
                iso === today && !isEdge && "font-semibold text-secondary ring-1 ring-inset ring-secondary",
              )}
            >
              <span className="tabular">{d.getDate()}</span>
              {evs.length > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {evs.slice(0, 3).map((e, j) => (
                    <span key={j} className={cn("size-1.5 rounded-full", isEdge ? "bg-white" : toneDot[e.tone])} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-helper text-ink-2">
        <Legend cls="ring-1 ring-secondary" label="Today" />
        <Legend cls={toneDot.holiday} label="Holiday" />
        <Legend cls={toneDot.optional} label="Optional holiday" />
        <Legend cls={toneDot.leave} label="Approved leave" />
        <Legend cls={toneDot.pending} label="Pending leave" />
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", cls)} />
      {label}
    </span>
  );
}
