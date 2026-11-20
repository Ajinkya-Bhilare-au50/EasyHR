/**
 * Page-level loading skeletons. Each one mirrors the real page's layout (same grid, card sizes
 * and spacing) so content swaps in without layout shift. Server-safe: no hooks, no "use client".
 * Used by the route `loading.tsx` files and by the app shell while the session is checked.
 */
import { cn } from "@/lib/utils";

export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-control bg-neutral-soft", className)} />;
}

function CardShell({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-card border border-line bg-surface shadow-card", className)}>{children}</div>;
}

/** Announces loading to screen readers once, without repeating every bone. */
function Live({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

export function PageHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2.5">
        <Bone className="h-8 w-48" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }).map((_, i) => <Bone key={i} className="h-btn w-36" />)}
        </div>
      )}
    </div>
  );
}

export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-6 flex gap-6 border-b border-line pb-3">
      {Array.from({ length: count }).map((_, i) => <Bone key={i} className="h-5 w-28" />)}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <CardShell className="p-5">
      <div className="flex items-center gap-3">
        <Bone className="size-10" />
        <Bone className="h-4 w-28" />
      </div>
      <Bone className="mt-5 h-8 w-20" />
      <Bone className="mt-2.5 h-3 w-40" />
    </CardShell>
  );
}

export function TableSkeleton({ rows = 6, cols = 5, toolbar = true }: { rows?: number; cols?: number; toolbar?: boolean }) {
  return (
    <CardShell>
      {toolbar && (
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Bone className="h-input w-44" />
          <Bone className="h-input w-44" />
          <div className="ml-auto flex gap-2">
            <Bone className="h-input w-56" />
            <Bone className="size-btn" />
          </div>
        </div>
      )}
      <div className="flex gap-4 border-b border-line bg-subtle px-4 py-3.5">
        {Array.from({ length: cols }).map((_, i) => <Bone key={i} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
          <div className="flex flex-1 items-center gap-2.5">
            <Bone className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3.5 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
          {Array.from({ length: cols - 1 }).map((_, i) => <Bone key={i} className="h-3.5 flex-1" />)}
        </div>
      ))}
    </CardShell>
  );
}

/** Generic module page: header, sub-tabs, optional KPI row, then a table. */
export function TablePageSkeleton({ tabs = 3, kpis = 0, actions = 0 }: { tabs?: number; kpis?: number; actions?: number }) {
  return (
    <div>
      <Live label="Loading page" />
      <PageHeaderSkeleton actions={actions} />
      {tabs > 0 && <TabsSkeleton count={tabs} />}
      {kpis > 0 && (
        <div className={cn("mb-6 grid grid-cols-2 gap-4", kpis >= 5 ? "lg:grid-cols-5" : kpis === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {Array.from({ length: kpis }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      )}
      <TableSkeleton />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Live label="Loading dashboard" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Bone className="h-4 w-56" />
          <Bone className="h-8 w-72" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-btn w-40" />
          <Bone className="h-btn w-36" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_1fr]">
        <CardShell className="p-6">
          <Bone className="h-5 w-32" />
          <Bone className="mt-6 h-10 w-56" />
          <Bone className="mt-5 h-2 w-full rounded-full" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Bone className="h-16" />
            <Bone className="h-16" />
          </div>
          <Bone className="mt-5 h-11 w-full" />
        </CardShell>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      </div>
      <CardShell className="p-5">
        <Bone className="h-5 w-40" />
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-20" />)}
        </div>
      </CardShell>
      <div className="grid gap-6 lg:grid-cols-3">
        <CardShell className="p-5 lg:col-span-2">
          <Bone className="h-5 w-48" />
          <div className="mt-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Bone key={i} className="h-8" />)}</div>
        </CardShell>
        <CardShell className="p-5">
          <Bone className="h-5 w-40" />
          <div className="mt-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Bone key={i} className="h-12" />)}</div>
        </CardShell>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Live label="Loading profile" />
      <CardShell className="overflow-hidden">
        <div className="h-24 bg-primary/90" />
        <div className="flex flex-col gap-5 px-6 pb-5 sm:flex-row sm:items-end">
          <Bone className="-mt-10 size-20 rounded-full ring-4 ring-surface" />
          <div className="flex-1 space-y-2.5">
            <Bone className="h-7 w-56" />
            <Bone className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-4 w-24" />)}
          </div>
        </div>
      </CardShell>
      <TabsSkeleton count={4} />
      <CardShell className="p-5">
        <Bone className="h-5 w-48" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-3 w-24" />
              <Bone className="h-4 w-40" />
            </div>
          ))}
        </div>
      </CardShell>
    </div>
  );
}

export function OrgChartSkeleton() {
  return (
    <div>
      <Live label="Loading org chart" />
      <PageHeaderSkeleton actions={2} />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <CardShell className="space-y-5 p-5">
          <Bone className="h-5 w-24" />
          <Bone className="h-input w-full" />
          {Array.from({ length: 8 }).map((_, i) => <Bone key={i} className="h-4 w-36" />)}
        </CardShell>
        <CardShell className="min-h-[480px] p-6">
          <div className="flex flex-col items-center gap-10 pt-6">
            <Bone className="h-24 w-56 rounded-card" />
            <div className="flex gap-8">{Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="h-24 w-56 rounded-card" />)}</div>
            <div className="hidden gap-8 xl:flex">{Array.from({ length: 4 }).map((_, i) => <Bone key={i} className="h-24 w-48 rounded-card" />)}</div>
          </div>
        </CardShell>
      </div>
    </div>
  );
}

/** Whole-app placeholder (sidebar + header + dashboard) shown while the session is checked. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-sidebar bg-sidebar lg:block" aria-hidden>
        <div className="flex h-header items-center gap-2.5 border-b border-white/10 px-5">
          <div className="size-8 rounded-[9px] bg-white/15" />
          <div className="h-4 w-20 rounded bg-white/15" />
        </div>
        <div className="space-y-2 px-3 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-3 px-3">
              <div className="size-5 rounded bg-white/10" />
              <div className="h-3.5 w-24 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </aside>
      <div className="lg:pl-sidebar">
        <div className="flex h-header items-center gap-4 border-b border-line bg-surface px-4 sm:px-page" aria-hidden>
          <Bone className="h-5 w-28" />
          <Bone className="mx-auto hidden h-10 w-full max-w-sm md:block" />
          <div className="ml-auto flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => <Bone key={i} className="size-10" />)}
            <Bone className="size-10 rounded-full" />
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:p-page">
          <DashboardSkeleton />
        </main>
      </div>
    </div>
  );
}
