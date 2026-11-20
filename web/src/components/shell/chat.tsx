"use client";

import { ArrowLeft, MessageCircle, Plus, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Drawer } from "../ui/dialog";
import { EmployeePicker } from "../ui/employee-picker";
import { EmptyState } from "../ui/feedback";
import { Bone } from "../ui/skeletons";

type Conversation = { user: UserBrief; last: string; at: string; unread: number };
type Msg = { id: string; body: string; mine: boolean; at: string };

/** "Send a message" chat in the header. */
export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [peer, setPeer] = useState<UserBrief | null>(null);
  const [composing, setComposing] = useState(false);
  return (
    <Drawer
      open={open}
      onClose={() => {
        onClose();
        setPeer(null);
        setComposing(false);
      }}
      title={
        peer ? (
          <span className="flex items-center gap-2">
            <button aria-label="Back" onClick={() => setPeer(null)} className="grid size-8 place-items-center rounded-control text-ink-2 hover:bg-neutral-soft">
              <ArrowLeft size={18} />
            </button>
            <Avatar name={peer.name} initials={peer.initials} size="sm" />
            <span className="leading-tight">
              <span className="block">{peer.name}</span>
              <span className="block text-helper font-normal text-ink-2">{peer.designation}</span>
            </span>
          </span>
        ) : (
          "Messages"
        )
      }
    >
      {peer ? <Thread peer={peer} /> : <Conversations onOpen={setPeer} composing={composing} setComposing={setComposing} />}
    </Drawer>
  );
}

function Conversations({ onOpen, composing, setComposing }: { onOpen: (u: UserBrief) => void; composing: boolean; setComposing: (v: boolean) => void }) {
  const { data, loading } = useApi<{ items: Conversation[] }>("/messages/conversations");
  return (
    <div>
      <div className="border-b border-line p-4">
        {composing ? (
          <EmployeePicker value={null} onChange={(u) => u && onOpen(u)} placeholder="Choose a colleague to message" />
        ) : (
          <Button icon={Plus} className="w-full" onClick={() => setComposing(true)}>
            New message
          </Button>
        )}
      </div>
      {loading && !data ? (
        <ul aria-busy aria-label="Loading conversations">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Bone className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bone className="h-3.5 w-1/2" />
                <Bone className="h-3 w-3/4" />
              </div>
            </li>
          ))}
        </ul>
      ) : !data?.items.length ? (
        <EmptyState icon={MessageCircle} title="No conversations yet" description="Send a quick message to a colleague or your manager." />
      ) : (
        <ul>
          {data.items.map((c) => (
            <li key={c.user.id}>
              <button onClick={() => onOpen(c.user)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-subtle">
                <Avatar name={c.user.name} initials={c.user.initials} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-body font-medium text-ink">{c.user.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{fmtDateTime(c.at)}</span>
                  </span>
                  <span className={cn("block truncate text-helper", c.unread ? "font-medium text-ink" : "text-ink-2")}>{c.last}</span>
                </span>
                {c.unread > 0 && <span className="grid size-5 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-white">{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thread({ peer }: { peer: UserBrief }) {
  const { data, setData } = useApi<{ items: Msg[] }>(`/messages?with=${peer.id}`);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView(), [data]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const m = await api<Msg>("/messages", { method: "POST", json: { to: peer.id, body: text } });
      setData((d) => ({ items: [...(d?.items ?? []), m] }));
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto bg-subtle p-4 scrollbar-thin">
        {!data && (
          <div className="space-y-3" aria-busy aria-label="Loading messages">
            {["w-2/3", "ml-auto w-1/2", "w-3/5", "ml-auto w-2/5"].map((w, i) => <Bone key={i} className={`h-12 rounded-card ${w}`} />)}
          </div>
        )}
        {data?.items.length === 0 && <p className="py-8 text-center text-helper text-ink-2">Say hello to {peer.name.split(" ")[0]}.</p>}
        {data?.items.map((m) => (
          <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-card px-3.5 py-2", m.mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-line bg-surface text-ink")}>
              <p className="whitespace-pre-wrap text-body">{m.body}</p>
              <p className={cn("mt-0.5 text-[11px]", m.mine ? "text-white/60" : "text-ink-3")}>{fmtDateTime(m.at)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line bg-surface p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          aria-label="Message"
          className="h-input flex-1 rounded-control border border-line px-3 text-body focus:border-secondary focus:shadow-focus focus:outline-none"
        />
        <Button type="submit" size="icon" icon={Send} loading={sending} aria-label="Send" />
      </form>
    </div>
  );
}
