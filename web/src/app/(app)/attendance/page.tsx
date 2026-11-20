import type { Metadata } from "next";
import { Suspense } from "react";
import { AttendanceView } from "@/components/features/attendance";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return (
    <Suspense>
      <AttendanceView />
    </Suspense>
  );
}
