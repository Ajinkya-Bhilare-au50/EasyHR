import type { Metadata } from "next";
import { Suspense } from "react";
import { HolidayView } from "@/components/features/holiday";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Holiday" };

export default function Page() {
  return (
    <Suspense>
      <HolidayView />
    </Suspense>
  );
}
