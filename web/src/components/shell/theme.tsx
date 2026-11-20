"use client";

import { Moon, Sun, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// Keys must match public/theme-init.js, which applies them before first paint.
const THEME_KEY = "easyhr.theme";
const CREDIT_KEY = "easyhr.credit";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const getTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerTheme = (): Theme | null => null;

export function useTheme() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, getServerTheme);
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
  };
  return { theme, setTheme };
}

/** Sun/moon button that switches between light and dark mode and remembers the choice. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} mode`;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-10 place-items-center rounded-control text-ink-2 transition-colors hover:bg-neutral-soft hover:text-ink",
        className,
      )}
    >
      {/* Before hydration the theme is unknown on the server; render an empty box of the same size. */}
      {theme === "dark" ? <Sun size={20} /> : theme === "light" ? <Moon size={20} /> : <span className="size-5" />}
    </button>
  );
}

/** Thin "Developed by" strip with a close button. Dismissal lasts for the browser session. */
export function CreditBanner() {
  const close = () => {
    document.documentElement.dataset.credit = "hidden";
    try {
      sessionStorage.setItem(CREDIT_KEY, "hidden");
    } catch {}
  };
  return (
    <div className="credit-banner no-print relative flex min-h-9 items-center justify-center bg-sidebar px-11 py-1.5 text-center text-[12px] leading-4 text-white/85 sm:text-[13px]">
      <p>
        Developed by <span className="font-semibold text-white">Ajinkya Bhilare</span>
      </p>
      <button
        type="button"
        onClick={close}
        aria-label="Close banner"
        title="Close"
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
