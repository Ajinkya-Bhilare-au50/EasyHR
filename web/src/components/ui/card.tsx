import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  // min-w-0: cards are often grid/flex items, whose default min-width:auto would let wide content
  // (e.g. a table inside overflow-x-auto) stretch the card and the page instead of scrolling inside it.
  return <div className={cn("min-w-0 rounded-card border border-line bg-surface shadow-card", className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    // flex-wrap: on narrow screens a wide action (e.g. a Segmented switch) drops below the title
    // instead of forcing the card, and the page, wider than the viewport.
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink">
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-card text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-helper text-ink-2">{description}</p>}
        </div>
      </div>
      {action && <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}

/** Label / value pair used on profile and detail cards. */
export function InfoItem({ label, value, className }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-helper text-ink-2">{label}</dt>
      <dd className="mt-1 truncate text-body font-medium text-ink">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}
