"use client";

import { CircleAlert, CircleCheck, Info, Inbox, Loader2, RefreshCw, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className, size = 18 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn("animate-spin text-ink-3", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-control bg-neutral-soft", className)} />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-neutral-soft text-ink-3">
        <Icon size={22} />
      </span>
      <p className="mt-3 text-card text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-body text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load this"
      description={message}
      action={onRetry && <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRetry}>Try again</Button>}
    />
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const map = {
    info: { cls: "bg-info-soft border-info-line text-info", icon: Info },
    warning: { cls: "bg-warning-soft border-warning-line text-warning", icon: TriangleAlert },
    danger: { cls: "bg-danger-soft border-danger-line text-danger", icon: CircleAlert },
    success: { cls: "bg-success-soft border-success-line text-success", icon: CircleCheck },
  }[tone];
  const Icon = map.icon;
  return (
    <div className={cn("flex gap-3 rounded-control border px-4 py-3", map.cls, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="text-body">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- toasts

type Toast = { id: number; tone: "success" | "danger" | "info"; title: string; body?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : t.tone === "danger" ? CircleAlert : Info;
          const color = t.tone === "success" ? "text-success" : t.tone === "danger" ? "text-danger" : "text-info";
          return (
            <div key={t.id} className="pointer-events-auto flex animate-slide-up gap-3 rounded-card border border-line bg-surface p-4 shadow-raised">
              <Icon size={20} className={cn("shrink-0", color)} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-body text-ink-2">{t.body}</p>}
              </div>
              <button aria-label="Dismiss" className="text-ink-3 hover:text-ink" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}>
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    success: (title: string, body?: string) => push({ tone: "success", title, body }),
    error: (title: string, body?: string) => push({ tone: "danger", title, body }),
    info: (title: string, body?: string) => push({ tone: "info", title, body }),
  };
}
