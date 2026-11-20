import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our custom type scale (globals.css @theme --text-*), otherwise it
// treats e.g. `text-body` as a colour and drops `text-white` from the same element.
// Same for the custom spacing keys (--spacing-*): without them `h-btn` and `h-11` are not seen as
// conflicting, both survive, and the stylesheet order (not the caller's override) decides.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: ["sidebar", "sidebar-collapsed", "header", "page", "btn", "input"] },
    classGroups: { "font-size": [{ text: ["page", "section", "card", "body", "helper", "kpi"] }] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let tz = "Asia/Calcutta";
/** Company timezone, set once /auth/me has loaded. Punch times display in this zone. */
export function setTimezone(zone?: string | null) {
  if (zone) tz = zone;
}

const toDate = (v: string | Date) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v));

/** 20 Nov 2026 */
export function fmtDate(v?: string | Date | null, opts: Intl.DateTimeFormatOptions = {}) {
  if (!v) return "—";
  const isDateOnly = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return toDate(v).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(isDateOnly ? {} : { timeZone: tz }),
    ...opts,
  });
}

/** 09:42 AM, in the company timezone */
export function fmtTime(v?: string | Date | null) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

/** "09:00:00" -> 09:00 AM */
export function fmtClock(v?: string | null) {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  return `${fmtDate(v)}, ${fmtTime(v)}`;
}

export function fmtHours(h?: number | null) {
  if (!h) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

export function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtMoney(n: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

/** Local yyyy-mm-dd */
export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function titleCase(s?: string | null) {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
