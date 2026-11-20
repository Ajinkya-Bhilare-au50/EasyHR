import type { Metadata } from "next";
import { Suspense } from "react";
import { LeavesView } from "@/components/features/leaves";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Leaves" };

export default function Page() {
  return (
    <Suspense>
      <LeavesView />
    </Suspense>
  );
}
