import type { Metadata } from "next";
import { Suspense } from "react";
import { OrgChartView } from "@/components/features/org-chart";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Org Chart" };

export default function Page() {
  return (
    <Suspense>
      <OrgChartView />
    </Suspense>
  );
}
