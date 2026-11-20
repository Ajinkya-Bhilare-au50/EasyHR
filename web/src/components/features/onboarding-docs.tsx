import { CircleCheck, CircleDashed, FileCheck2 } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Card, CardBody, CardHeader } from "../ui/card";

/** Onboarding documents checklist: HR ticks what a new joiner handed over. No files are stored. */
export type DocItem = { key: string; label: string; providedOn: string | null };
export type DocStatus = { provided: number; total: number; items: DocItem[] };

/** "7/10" pill: green when complete, amber when partial, grey when nothing is in yet. */
export function DocsBadge({ docs }: { docs: DocStatus }) {
  const tone = docs.provided === docs.total ? "success" : docs.provided > 0 ? "warning" : "neutral";
  return (
    <Badge tone={tone} icon={docs.provided === docs.total ? CircleCheck : undefined}>
      {docs.provided}/{docs.total}
    </Badge>
  );
}

/** Read-only checklist for the profile page. */
export function DocumentsCard({ docs }: { docs: DocStatus }) {
  const pct = docs.total ? Math.round((docs.provided / docs.total) * 100) : 0;
  return (
    <Card>
      <CardHeader
        icon={FileCheck2}
        title="Onboarding documents"
        description={`${docs.provided} of ${docs.total} provided`}
        action={<DocsBadge docs={docs} />}
      />
      <CardBody>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documents provided">
          <div className={cn("h-full rounded-full", pct === 100 ? "bg-success" : "bg-secondary")} style={{ width: `${pct}%` }} />
        </div>
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {docs.items.map((d) => (
            <li key={d.key} className="flex items-start gap-2.5">
              {d.providedOn ? (
                <CircleCheck size={18} className="mt-px shrink-0 text-success" aria-label="Provided" />
              ) : (
                <CircleDashed size={18} className="mt-px shrink-0 text-ink-3" aria-label="Not provided" />
              )}
              <span className="min-w-0">
                <span className={cn("block text-body", d.providedOn ? "text-ink" : "text-ink-2")}>{d.label}</span>
                <span className="block text-helper text-ink-3">{d.providedOn ? `Marked on ${fmtDate(d.providedOn)}` : "Pending"}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-helper text-ink-3">HR records which documents were handed over. Copies are not stored in EasyHR.</p>
      </CardBody>
    </Card>
  );
}
