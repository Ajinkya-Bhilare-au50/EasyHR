import type { Metadata } from "next";
import { DashboardView } from "@/components/features/dashboard";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardView />;
}
