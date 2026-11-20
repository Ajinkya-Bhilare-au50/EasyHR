"use client";

import { Building2, Clock, House, LogIn, LogOut, MapPin, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { TodayState } from "@/lib/types";
import { cn, fmtClock, fmtDuration, fmtTime } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Skeleton, useToast } from "../ui/feedback";
import { Segmented } from "../ui/tabs";

/** Check-in / check-out widget. One component, used on the dashboard and the attendance page. */
export function CheckInWidget({ onChange, className }: { onChange?: () => void; className?: string }) {
  const { data, setData, loading } = useApi<TodayState>("/attendance/today");
  const [location, setLocation] = useState<"WFO" | "WFH">("WFO");
  const [busy, setBusy] = useState(false);
  // `now` is the server clock: local time corrected by the skew measured from the last response.
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef(0);
  const toast = useToast();

  useEffect(() => {
    if (data?.serverTime) skew.current = new Date(data.serverTime).getTime() - Date.now();
  }, [data?.serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) {
    return (
      <Card className={cn("p-6", className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-6 h-12 w-56" />
        <Skeleton className="mt-6 h-11 w-full" />
      </Card>
    );
  }
  if (!data) return null;

  const serverNow = now;
  const worked = data.workedSeconds + (data.openSince ? Math.max(0, (serverNow - new Date(data.openSince).getTime()) / 1000) : 0);
  const target = 9 * 3600;
  const pct = Math.min(100, (worked / target) * 100);
  const clock = new Date(serverNow).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: data.timezone });
  const dateLabel = new Date(serverNow).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: data.timezone });

  const punch = async () => {
    setBusy(true);
    try {
      const next = await api<TodayState>("/attendance/punch", { method: "POST", json: { location } });
      setData(next);
      toast.success(next.checkedIn ? "Checked in" : "Checked out", `Recorded at ${fmtTime(next.punches[next.punches.length - 1]?.time)} (server time).`);
      onChange?.();
    } catch (e) {
      toast.error("Could not record punch", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-card text-ink">
              <Clock size={18} className="text-secondary" /> Attendance
            </p>
            <p className="mt-0.5 text-helper text-ink-2">{dateLabel}</p>
          </div>
          {data.checkedIn ? (
            <Badge tone="success">
              <span className="relative mr-0.5 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Checked in
            </Badge>
          ) : data.firstIn ? (
            <Badge tone="neutral">Checked out</Badge>
          ) : (
            <Badge tone="warning">Not checked in</Badge>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[34px] font-semibold leading-none tracking-tight text-ink tabular">{clock}</p>
            <p className="mt-2 text-helper text-ink-2">
              Shift {fmtClock(data.shiftStart)} – {fmtClock(data.shiftEnd)}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-helper text-ink-2">
              <Timer size={14} /> Worked today
            </p>
            <p className="text-section text-ink tabular">{fmtDuration(worked)}</p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress towards 9 hours">
          <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-success" : "bg-secondary")} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-control border border-line bg-subtle px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-helper text-ink-2"><LogIn size={14} /> First in</p>
            <p className="mt-0.5 text-body font-semibold text-ink tabular">{fmtTime(data.firstIn)}</p>
          </div>
          <div className="rounded-control border border-line bg-subtle px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-helper text-ink-2"><LogOut size={14} /> Last out</p>
            <p className="mt-0.5 text-body font-semibold text-ink tabular">{fmtTime(data.lastOut)}</p>
          </div>
        </div>

        {/* Mobile: switch and button stack, both full width. sm+: one row, the button fills the rest.
            flex-1 only from sm up: in the mobile column, flex-basis 0 would override h-11 and squash the button. */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!data.checkedIn && (
            <Segmented
              className="flex w-full sm:inline-flex sm:w-auto [&>button]:h-10 [&>button]:flex-1 [&>button]:justify-center sm:[&>button]:h-8 sm:[&>button]:flex-none"
              value={location}
              onChange={setLocation}
              options={[
                { value: "WFO", label: "Office", icon: Building2 },
                { value: "WFH", label: "Home", icon: House },
              ]}
            />
          )}
          <Button
            className="h-11 w-full sm:w-auto sm:flex-1"
            variant={data.checkedIn ? "destructive" : "primary"}
            icon={data.checkedIn ? LogOut : LogIn}
            loading={busy}
            onClick={punch}
          >
            {data.checkedIn ? "Check-out" : "Check-in"}
          </Button>
        </div>

        {data.punches.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-helper font-semibold uppercase tracking-wide text-ink-3">Today&rsquo;s punches</p>
            <ul className="flex flex-wrap gap-2">
              {data.punches.map((p, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-helper text-ink-2">
                  {p.type === "in" ? <LogIn size={13} className="text-success" /> : <LogOut size={13} className="text-danger" />}
                  <span className="font-medium text-ink tabular">{fmtTime(p.time)}</span>
                  {p.location && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin size={11} /> {p.location}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
