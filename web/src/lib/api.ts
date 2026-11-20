"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0] as { loc?: string[]; msg?: string };
    const field = d.loc?.[d.loc.length - 1];
    return field ? `${field}: ${d.msg}` : d.msg ?? "Invalid request";
  }
  return "Something went wrong";
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, detailMessage(data?.detail));
  return data as T;
}

/**
 * In-memory response cache shared by every useApi call (stale-while-revalidate).
 * Revisiting a page renders its last data instantly while a fresh copy loads in the background.
 * It lives only in this tab's memory and is cleared on sign-in/out (a full page load) and by
 * clearApiCache(); the API still authorises every request.
 */
const cache = new Map<string, unknown>();
/** Requests already in flight, so several components asking for the same path share one fetch. */
const inflight = new Map<string, Promise<unknown>>();

export function clearApiCache() {
  cache.clear();
  inflight.clear();
}

function load<T>(path: string, fresh: boolean): Promise<T> {
  // `fresh` (an explicit reload, e.g. after approving something) never reuses an older request.
  let p = fresh ? undefined : (inflight.get(path) as Promise<T> | undefined);
  if (!p) {
    p = api<T>(path).then(
      (d) => {
        cache.set(path, d);
        inflight.delete(path);
        return d;
      },
      (e) => {
        inflight.delete(path);
        throw e;
      },
    );
    inflight.set(path, p);
  }
  return p;
}

type Settled = { key: string | null; error: string | null };

/**
 * Data hook: fetches when the path changes and on reload(). Pass null to skip.
 * - `data` comes from the shared cache, so a revisited page shows its last data immediately.
 * - `loading` is true while a request for the current key is in flight (derived, not set in the
 *   effect). Components show skeletons only when `loading && !data`.
 */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled>({ key: null, error: null });
  const [, rerender] = useState(0);
  const key = path ? `${path}#${nonce}` : null;

  useEffect(() => {
    if (!path || !key) return;
    let alive = true;
    load<T>(path, nonce > 0).then(
      () => alive && setSettled({ key, error: null }),
      (e) => alive && setSettled({ key, error: e instanceof Error ? e.message : "Failed to load" }),
    );
    return () => {
      alive = false;
    };
  }, [path, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (u: T | null | ((prev: T | null) => T | null)) => {
      if (!path) return;
      const prev = (cache.get(path) as T | undefined) ?? null;
      cache.set(path, typeof u === "function" ? (u as (p: T | null) => T | null)(prev) : u);
      rerender((n) => n + 1);
    },
    [path],
  );

  const data = path ? ((cache.get(path) as T | undefined) ?? null) : null;
  const error = settled.key === key ? settled.error : null;
  return { data, error: data ? null : error, loading: !!key && settled.key !== key, reload, setData };
}

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
