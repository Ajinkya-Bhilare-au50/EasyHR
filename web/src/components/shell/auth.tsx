"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { setTimezone } from "@/lib/utils";

type AuthCtx = { me: Me; can: (p: string) => boolean; refresh: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(
    () =>
      api<Me>("/auth/me").then(
        (m) => {
          if (m.user.isMasterAdmin && !m.company) {
            window.location.href = "/master";
            return;
          }
          setTimezone(m.company?.timezone);
          setMe(m);
        },
        () => {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        },
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = load;

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  if (!me) return <>{fallback}</>;
  return <Ctx.Provider value={{ me, can: (p) => me.permissions.includes(p), refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
