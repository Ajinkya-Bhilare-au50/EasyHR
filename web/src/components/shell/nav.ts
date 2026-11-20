import {
  CalendarDays, ChartNoAxesCombined, Clock, LayoutDashboard, Network, Palmtree, Settings, UserRound, UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Me } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: string;
  visible?: (me: Me, can: (p: string) => boolean) => boolean;
};

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/org-chart", label: "Org Chart", icon: Network, module: "orgchart", visible: (_, can) => can("orgchart.view") },
  { href: "/leaves", label: "Leaves", icon: CalendarDays, module: "leave" },
  { href: "/attendance", label: "Attendance", icon: Clock, module: "attendance" },
  { href: "/holiday", label: "Holiday", icon: Palmtree, module: "holiday" },
];

export const NAV_ADMIN: NavItem[] = [
  { href: "/employees", label: "Employees", icon: UsersRound, visible: (_, can) => can("employees.manage") },
  { href: "/reports", label: "Reports", icon: ChartNoAxesCombined, visible: (_, can) => can("holiday.reports") || can("audit.view") },
  { href: "/settings", label: "Settings", icon: Settings, visible: (_, can) => can("settings.manage") },
];

export function visibleItems(items: NavItem[], me: Me, can: (p: string) => boolean) {
  return items.filter((i) => (!i.module || me.enabledModules.includes(i.module)) && (!i.visible || i.visible(me, can)));
}

export function titleFor(pathname: string): string {
  const all = [...NAV_MAIN, ...NAV_ADMIN];
  const hit = all.filter((i) => i.href !== "/" && pathname.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.label ?? "Dashboard";
}
