"use client";

import {
  Bell, ChevronDown, CircleHelp, LogOut, Menu, MessageCircle, Search, Settings, UserRound,
  CircleCheck, CircleAlert, Info, TriangleAlert, CheckCheck,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Popover, MenuList } from "../ui/menu";
import { Bone } from "../ui/skeletons";
import { useAuth } from "./auth";
import { ChatDrawer } from "./chat";
import { HelpDrawer } from "./help";
import { titleFor } from "./nav";
import { ThemeToggle } from "./theme";

type Notif = { id: string; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

function IconButton({ label, onClick, children, badge }: { label: string; onClick?: () => void; children: React.ReactNode; badge?: number }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative grid size-10 place-items-center rounded-control text-ink-2 transition-colors hover:bg-neutral-soft hover:text-ink"
    >
      {children}
      {!!badge && (
        <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<UserBrief[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => api<{ items: UserBrief[] }>(`/employees/lookup?q=${encodeURIComponent(q)}`).then((r) => setItems(r.items)).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.querySelector("input")?.focus();
      }
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  return (
    <div className="relative hidden w-full max-w-sm md:block" ref={ref}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search people…"
        aria-label="Search people"
        className="h-10 w-full rounded-control border border-line bg-subtle pl-9 pr-14 text-body text-ink placeholder:text-ink-3 focus:border-secondary focus:bg-surface focus:shadow-focus focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 text-[11px] font-medium text-ink-3">Ctrl K</kbd>
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 animate-slide-up rounded-card border border-line bg-surface p-1.5 shadow-raised">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-body text-ink-2">No people match &ldquo;{q}&rdquo;</p>
          ) : (
            items.slice(0, 8).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(`/profile/${u.id}`);
                }}
                className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-neutral-soft"
              >
                <Avatar name={u.name} initials={u.initials} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink">{u.name}</span>
                  <span className="block truncate text-helper text-ink-2">{[u.employeeCode, u.designation, u.department].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const notifIcon = { success: CircleCheck, danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
const notifTone = { success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info" } as const;

function Notifications() {
  const { data, reload } = useApi<{ unread: number; items: Notif[] }>("/notifications");
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  return (
    <Popover
      className="w-[min(380px,calc(100vw-24px))]"
      trigger={(_, toggle) => (
        <IconButton label="Notifications" onClick={toggle} badge={data?.unread}>
          <Bell size={20} />
        </IconButton>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-card text-ink">Notifications</p>
            <button
              className="flex items-center gap-1 text-helper font-medium text-secondary hover:underline disabled:opacity-40"
              disabled={!data?.unread}
              onClick={async () => {
                await api("/notifications/read-all", { method: "POST" });
                reload();
              }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <ul className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {!data &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex gap-3 border-b border-line px-4 py-3" aria-hidden>
                  <Bone className="size-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Bone className="h-3.5 w-1/2" />
                    <Bone className="h-3 w-5/6" />
                  </div>
                </li>
              ))}
            {data && !data.items.length && <li className="px-4 py-10 text-center text-body text-ink-2">You&rsquo;re all caught up.</li>}
            {data?.items.map((n) => {
              const kind = (n.kind in notifIcon ? n.kind : "info") as keyof typeof notifIcon;
              const Icon = notifIcon[kind];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      close();
                      if (n.link) router.push(n.link);
                    }}
                    className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-subtle", !n.read && "bg-info-soft/40")}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", notifTone[kind])}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-body font-medium text-ink">{n.title}</span>
                        {!n.read && <span className="size-2 shrink-0 rounded-full bg-secondary" />}
                      </span>
                      <span className="line-clamp-2 text-helper text-ink-2">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-ink-3">{fmtDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Popover>
  );
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { me, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [chat, setChat] = useState(false);
  const [help, setHelp] = useState(false);
  const { data: conv, reload: reloadConv } = useApi<{ unread: number }>("/messages/conversations");

  return (
    <header className="sticky top-0 z-30 flex h-header shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-page">
      <button onClick={onMenu} aria-label="Open navigation" className="-ml-1 grid size-10 place-items-center rounded-control text-ink-2 hover:bg-neutral-soft lg:hidden">
        <Menu size={22} />
      </button>
      <div className="min-w-0 shrink-0">
        <p className="hidden text-helper text-ink-3 sm:block">{me.company?.name}</p>
        <p className="truncate text-card text-ink">{titleFor(pathname)}</p>
      </div>
      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-0.5">
        <ThemeToggle />
        <Notifications />
        <IconButton label="Messages" onClick={() => setChat(true)} badge={conv?.unread}>
          <MessageCircle size={20} />
        </IconButton>
        <IconButton label="Need help?" onClick={() => setHelp(true)}>
          <CircleHelp size={20} />
        </IconButton>
        <Popover
          trigger={(open, toggle) => (
            <button onClick={toggle} aria-label="User menu" className="ml-1 flex items-center gap-2 rounded-control py-1 pl-1 pr-2 hover:bg-neutral-soft">
              <Avatar name={me.user.name} initials={me.user.initials} size="sm" />
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-[13px] font-medium text-ink">{me.user.name}</span>
                <span className="block text-[11px] text-ink-2">{me.roles.filter((r) => r !== "Employee").join(", ") || "Employee"}</span>
              </span>
              <ChevronDown size={16} className={cn("hidden text-ink-3 transition-transform sm:block", open && "rotate-180")} />
            </button>
          )}
        >
          {(close) => (
            <div className="w-64">
              <div className="flex items-center gap-3 border-b border-line p-4">
                <Avatar name={me.user.name} initials={me.user.initials} />
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-ink">{me.user.name}</p>
                  <p className="truncate text-helper text-ink-2">{me.user.email}</p>
                  <p className="truncate text-helper text-ink-3">Emp. code {me.user.employeeCode}</p>
                </div>
              </div>
              <MenuList
                close={close}
                items={[
                  { label: "My profile", icon: UserRound, onClick: () => router.push("/profile") },
                  ...(can("settings.manage") ? [{ label: "Company settings", icon: Settings, onClick: () => router.push("/settings") }] : []),
                  { label: "Sign out", icon: LogOut, onClick: logout, danger: true },
                ]}
              />
            </div>
          )}
        </Popover>
      </div>
      <ChatDrawer open={chat} onClose={() => { setChat(false); reloadConv(); }} />
      <HelpDrawer open={help} onClose={() => setHelp(false)} pathname={pathname} />
    </header>
  );
}

export function ImpersonationBanner() {
  const { me, logout } = useAuth();
  if (!me.impersonating) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-warning px-4 py-2 text-center text-[13px] font-medium text-white">
      Support session: you are signed in as {me.user.name} ({me.company?.name}). All actions are audit-logged.
      <button onClick={logout} className="rounded-[6px] bg-white/20 px-2 py-0.5 hover:bg-white/30">
        End session
      </button>
    </div>
  );
}

