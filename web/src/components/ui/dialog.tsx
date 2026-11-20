"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-[#0f172a]/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("relative flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-card bg-surface shadow-raised sm:rounded-card", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-section text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-body text-ink-2">{description}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="-mr-2 grid size-9 place-items-center rounded-control text-ink-2 hover:bg-neutral-soft hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle px-6 py-3.5 sm:rounded-b-card">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  width = "w-[min(420px,100vw)]",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  side?: "left" | "right";
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal>
      <div className="absolute inset-0 animate-fade-in bg-[#0f172a]/40" onClick={onClose} />
      <div
        className={cn(
          "absolute top-0 flex h-full flex-col bg-surface shadow-raised",
          width,
          side === "right" ? "right-0 animate-slide-in-right" : "left-0 animate-slide-in-left",
        )}
      >
        {title && (
          <div className="flex h-header shrink-0 items-center justify-between border-b border-line px-5">
            <div className="text-card text-ink">{title}</div>
            <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-control text-ink-2 hover:bg-neutral-soft hover:text-ink">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
