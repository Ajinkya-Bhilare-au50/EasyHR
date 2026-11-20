"use client";

import { Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { Drawer } from "../ui/dialog";
import { ToastProvider } from "../ui/feedback";
import { AppShellSkeleton } from "../ui/skeletons";
import { AuthProvider } from "./auth";
import { Header, ImpersonationBanner } from "./header";
import { NavProgress } from "./nav-progress";
import { SidebarContent } from "./sidebar";
import { CreditBanner } from "./theme";


export function AppShell({ children }: { children: React.ReactNode }) {
  // The shell renders only after /auth/me resolves on the client, so reading
  // localStorage in the initializer cannot cause a hydration mismatch.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("easyhr.sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [mobile, setMobile] = useState(false);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("easyhr.sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });

  return (
    <AuthProvider fallback={<AppShellSkeleton />}>
      <ToastProvider>
        {/* useSearchParams inside needs its own Suspense boundary (cacheComponents). */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <div className="min-h-screen bg-canvas">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block",
              collapsed ? "w-sidebar-collapsed" : "w-sidebar",
            )}
          >
            <SidebarContent collapsed={collapsed} onToggle={toggle} />
          </aside>
          <Drawer open={mobile} onClose={() => setMobile(false)} side="left" width="w-sidebar">
            <SidebarContent collapsed={false} onNavigate={() => setMobile(false)} />
          </Drawer>
          <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", collapsed ? "lg:pl-sidebar-collapsed" : "lg:pl-sidebar")}>
            <CreditBanner />
            <ImpersonationBanner />
            <Header onMenu={() => setMobile(true)} />
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:p-page">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}
