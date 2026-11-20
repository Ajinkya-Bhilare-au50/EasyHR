import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bone } from "./skeletons";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-8 text-ink sm:text-page">{title}</h1>
        {description && <p className="mt-1 text-body text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-section text-ink">{children}</h2>
      {action}
    </div>
  );
}

const kpiTones = {
  primary: { chip: "bg-primary-soft text-primary-ink", ghost: "text-primary-ink" },
  accent: { chip: "bg-accent-soft text-accent", ghost: "text-accent" },
  info: { chip: "bg-info-soft text-info", ghost: "text-info" },
  warning: { chip: "bg-warning-soft text-warning", ghost: "text-warning" },
  success: { chip: "bg-success-soft text-success", ghost: "text-success" },
  danger: { chip: "bg-danger-soft text-danger", ghost: "text-danger" },
};

/** KPI card: icon, title, large value, supporting text, faint background icon. */
export function KpiCard({
  icon: Icon,
  title,
  value,
  unit,
  description,
  tone = "primary",
  footer,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  value: React.ReactNode;
  unit?: string;
  description?: React.ReactNode;
  tone?: keyof typeof kpiTones;
  footer?: React.ReactNode;
  /** Show skeleton bars in place of the value and description while data loads. */
  loading?: boolean;
}) {
  const t = kpiTones[tone];
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-card border border-line bg-surface p-5 shadow-card" aria-busy>
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 place-items-center rounded-control opacity-60", t.chip)}>
            <Icon size={22} strokeWidth={2} />
          </span>
          <p className="text-body font-medium text-ink-2">{title}</p>
        </div>
        <Bone className="mt-5 h-8 w-20" />
        {description !== undefined && <Bone className="mt-2.5 h-3 w-40 max-w-full" />}
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-surface p-5 shadow-card">
      <Icon size={96} strokeWidth={1.25} className={cn("pointer-events-none absolute -bottom-5 -right-4 opacity-[0.06]", t.ghost)} aria-hidden />
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 place-items-center rounded-control", t.chip)}>
          <Icon size={22} strokeWidth={2} />
        </span>
        <p className="text-body font-medium text-ink-2">{title}</p>
      </div>
      <p className="mt-4 text-kpi tabular text-ink">
        {value}
        {unit && <span className="ml-1.5 text-body font-medium text-ink-2">{unit}</span>}
      </p>
      {description && <p className="mt-1 text-helper text-ink-2">{description}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 border-b border-line p-4 md:flex-row md:flex-wrap md:items-end", className)}>{children}</div>;
}
