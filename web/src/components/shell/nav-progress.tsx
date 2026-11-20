"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Thin top progress bar for in-app navigation. Starts when an internal link is clicked and
 * completes when the URL actually changes, so slow page loads never feel unresponsive.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [width, setWidth] = useState(0);
  const url = `${pathname}?${search.toString()}`;
  const last = useRef(url);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start on clicks to internal links that go somewhere else.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname + to.search === window.location.pathname + window.location.search) return;
      timers.current.forEach(clearTimeout);
      setState("loading");
      setWidth(12);
      // Ease towards 90% while waiting; never reaches 100% until the route really changes.
      timers.current = [150, 400, 900, 1800, 3500].map((ms, i) => setTimeout(() => setWidth([35, 55, 70, 82, 90][i]), ms));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Finish when the URL changes (navigation committed). Updates happen in timer callbacks.
  useEffect(() => {
    if (last.current === url) return;
    last.current = url;
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => {
        setWidth(100);
        setState("done");
      }, 0),
      setTimeout(() => {
        setState("idle");
        setWidth(0);
      }, 350),
    ];
  }, [url]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]" role="progressbar" aria-label="Loading page" aria-busy={state === "loading"}>
      <div
        className="h-full bg-secondary shadow-[0_0_8px_rgb(37_99_235/0.6)] transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${width}%`, opacity: state === "done" ? 0 : 1 }}
      />
    </div>
  );
}
