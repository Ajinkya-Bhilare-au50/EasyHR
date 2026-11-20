import type { Metadata } from "next";
import { Suspense } from "react";
import { EmployeesView } from "@/components/features/employees";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Employees" };

export default function Page() {
  return (
    <Suspense>
      <EmployeesView />
    </Suspense>
  );
}
