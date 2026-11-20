import { CheckCheck, CircleDashed, Clock, Send, XCircle, Ban } from "lucide-react";
import type { TimelineStep } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";

/** Approval chain: You > manager(s) > completed. */
export function ApprovalTimeline({
  requester,
  submittedAt,
  steps,
  finalStatus,
}: {
  requester: string;
  submittedAt: string;
  steps: TimelineStep[];
  finalStatus: string;
}) {
  const done = finalStatus === "approved" || finalStatus === "rejected" || finalStatus === "cancelled";
  const nodes = [
    { key: "you", icon: Send, title: `Submitted by ${requester}`, sub: fmtDateTime(submittedAt), tone: "done" as const, comment: null as string | null },
    ...steps.map((s) => ({
      key: `s${s.step}`,
      icon: s.status === "approved" ? CheckCheck : s.status === "rejected" ? XCircle : s.status === "pending" ? Clock : CircleDashed,
      title: `${s.approver ?? "Approver"} · Level ${s.step}`,
      sub:
        s.status === "approved" ? `Approved ${fmtDateTime(s.decidedAt)}` :
        s.status === "rejected" ? `Rejected ${fmtDateTime(s.decidedAt)}` :
        s.status === "pending" ? "Awaiting decision" : s.status === "skipped" ? "Not required" : "Waiting for previous step",
      tone: s.status === "approved" ? ("done" as const) : s.status === "rejected" ? ("bad" as const) : s.status === "pending" ? ("current" as const) : ("idle" as const),
      comment: s.comment,
    })),
    {
      key: "end",
      icon: finalStatus === "rejected" ? XCircle : finalStatus === "cancelled" ? Ban : CheckCheck,
      title: finalStatus === "rejected" ? "Rejected" : finalStatus === "cancelled" ? "Cancelled" : "Completed",
      sub: done ? "Request closed" : "Pending approval",
      tone: finalStatus === "approved" ? ("done" as const) : finalStatus === "rejected" ? ("bad" as const) : ("idle" as const),
      comment: null,
    },
  ];
  const toneCls = {
    done: "bg-success-soft text-success ring-success-line",
    bad: "bg-danger-soft text-danger ring-danger-line",
    current: "bg-warning-soft text-warning ring-warning-line",
    idle: "bg-neutral-soft text-ink-3 ring-neutral-line",
  };
  return (
    <ol className="relative">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        return (
          <li key={n.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < nodes.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-32px)] w-px bg-line" aria-hidden />}
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset", toneCls[n.tone])}>
              <Icon size={15} strokeWidth={2.25} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-body font-medium text-ink">{n.title}</p>
              <p className="text-helper text-ink-2">{n.sub}</p>
              {n.comment && <p className="mt-1.5 rounded-control bg-subtle px-3 py-2 text-helper text-ink-2">&ldquo;{n.comment}&rdquo;</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
