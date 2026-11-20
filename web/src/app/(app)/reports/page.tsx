import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsView } from "@/components/features/reports";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
