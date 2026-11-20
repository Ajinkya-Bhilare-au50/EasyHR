"use client";

import { CheckCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "../ui/button";
import { Modal } from "../ui/dialog";
import { useToast } from "../ui/feedback";
import { Field, Textarea } from "../ui/form";

export type Decision = { id: string; action: "approve" | "reject"; summary: React.ReactNode } | null;

/** Shared approve / reject dialog used by leave, holiday and attendance approvals. */
export function DecisionModal({
  decision,
  endpoint,
  onClose,
  onDone,
}: {
  decision: Decision;
  endpoint: (id: string) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!decision) return null;
  const approve = decision.action === "approve";

  const submit = async () => {
    if (!approve && !comment.trim()) return;
    setBusy(true);
    try {
      await api(endpoint(decision.id), { method: "PATCH", json: { action: decision.action, comment: comment.trim() || null } });
      toast.success(approve ? "Request approved" : "Request rejected");
      setComment("");
      onDone();
      onClose();
    } catch (e) {
      toast.error("Action failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={approve ? "Approve request" : "Reject request"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={approve ? "success" : "destructive"} icon={approve ? CheckCheck : XCircle} loading={busy} onClick={submit} disabled={!approve && !comment.trim()}>
            {approve ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-control border border-line bg-subtle p-3.5 text-body">{decision.summary}</div>
        <Field label="Comment" htmlFor="decision-comment" required={!approve} hint={approve ? "Optional. Visible to the employee." : "Tell the employee why this was rejected."}>
          <Textarea id="decision-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={approve ? "Enjoy your time off!" : "Reason for rejection"} />
        </Field>
      </div>
    </Modal>
  );
}
