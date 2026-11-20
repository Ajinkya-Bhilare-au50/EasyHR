import { cn } from "@/lib/utils";

/**
 * EasyHR mark: two overlapping rounded shapes suggesting people + structure.
 * `light` is for dark navy backgrounds (sidebar, login panel), where a navy tile would vanish:
 * the tile becomes translucent white with a hairline edge instead.
 */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      {light ? (
        <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#fff" fillOpacity="0.12" stroke="#fff" strokeOpacity="0.22" />
      ) : (
        <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      )}
      <circle cx="12" cy="12.5" r="4" fill="#fff" />
      <path d="M5.5 24.5c.8-4 3.4-6.2 6.5-6.2s5.7 2.2 6.5 6.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <circle cx="22.5" cy="11" r="3" fill="#5EEAD4" />
      <path d="M19.8 17.6c.8-.5 1.7-.8 2.7-.8 2.5 0 4.4 1.8 5 5" stroke="#5EEAD4" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ collapsed, light }: { collapsed?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark light={light} />
      {!collapsed && (
        <span className={cn("text-[18px] font-semibold tracking-[-0.01em]", light ? "text-white" : "text-ink")}>
          Easy<span className={light ? "text-[#5EEAD4]" : "text-accent"}>HR</span>
        </span>
      )}
    </span>
  );
}
