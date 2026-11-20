"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth";
import { Logo } from "./logo";
import { NAV_ADMIN, NAV_MAIN, type NavItem, visibleItems } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-control text-body font-medium transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-white/[0.12] text-white" : "text-[#c7d3e3] hover:bg-white/[0.06] hover:text-white",
      )}
    >
      {active && <span className="absolute left-0 top-2.5 h-6 w-[3px] rounded-r-full bg-[#5EEAD4]" />}
      <Icon size={21} strokeWidth={active ? 2.1 : 1.85} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function SidebarContent({ collapsed, onNavigate, onToggle }: { collapsed: boolean; onNavigate?: () => void; onToggle?: () => void }) {
  const { me, can } = useAuth();
  const main = visibleItems(NAV_MAIN, me, can);
  const admin = visibleItems(NAV_ADMIN, me, can);
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn("flex h-header shrink-0 items-center border-b border-white/10", collapsed ? "justify-center" : "px-5")}>
        <Link href="/" onClick={onNavigate} aria-label="EasyHR dashboard">
          <Logo collapsed={collapsed} light />
        </Link>
      </div>
      {!collapsed && me.company && (
        <div className="mx-3 mt-4 rounded-control bg-white/[0.06] px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#8fa3bf]">Workspace</p>
          <p className="truncate text-body font-medium text-white">{me.company.name}</p>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Main">
        <div className="flex flex-col gap-1">
          {main.map((i) => (
            <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
        {admin.length > 0 && (
          <>
            {!collapsed ? (
              <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#8fa3bf]">Administration</p>
            ) : (
              <div className="mx-3 my-4 h-px bg-white/10" />
            )}
            <div className="flex flex-col gap-1">
              {admin.map((i) => (
                <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        )}
      </nav>
      {onToggle && (
        <div className="border-t border-white/10 p-3">
          <button
            onClick={onToggle}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-control text-body text-[#c7d3e3] hover:bg-white/[0.06] hover:text-white",
              collapsed ? "justify-center" : "px-3",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      )}
    </div>
  );
}
