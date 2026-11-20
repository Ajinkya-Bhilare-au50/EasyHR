import { CircleCheck, CircleX, Clock, Ban, type LucideIcon, Palmtree, CalendarDays, Moon, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success ring-success-line",
  warning: "bg-warning-soft text-warning ring-warning-line",
  danger: "bg-danger-soft text-danger ring-danger-line",
  info: "bg-info-soft text-info ring-info-line",
  neutral: "bg-neutral-soft text-neutral ring-neutral-line",
  accent: "bg-accent-soft text-accent ring-accent-line",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-helper font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon size={13} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

const statusMap: Record<string, { tone: Tone; icon: LucideIcon; label: string }> = {
  approved: { tone: "success", icon: CircleCheck, label: "Approved" },
  pending: { tone: "warning", icon: Clock, label: "Pending" },
  rejected: { tone: "danger", icon: CircleX, label: "Rejected" },
  cancelled: { tone: "neutral", icon: Ban, label: "Cancelled" },
  active: { tone: "success", icon: CircleCheck, label: "Active" },
  suspended: { tone: "danger", icon: Ban, label: "Suspended" },
  exited: { tone: "neutral", icon: Ban, label: "Exited" },
};

/** Approval status: Approved green, Pending amber, Rejected red, Cancelled slate. */
export function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] ?? { tone: "neutral" as Tone, icon: CircleDashed, label: status };
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

export const attendanceStatus: Record<string, { tone: Tone; icon: LucideIcon; label: string }> = {
  P: { tone: "success", icon: CircleCheck, label: "Present" },
  A: { tone: "danger", icon: CircleX, label: "Absent" },
  L: { tone: "info", icon: CalendarDays, label: "On leave" },
  H: { tone: "accent", icon: Palmtree, label: "Holiday" },
  WO: { tone: "neutral", icon: Moon, label: "Week off" },
  NM: { tone: "warning", icon: Clock, label: "Not marked" },
};

export function AttendanceBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-ink-3">—</span>;
  const s = attendanceStatus[status] ?? { tone: "neutral" as Tone, icon: CircleDashed, label: status };
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}
