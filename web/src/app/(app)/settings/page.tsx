import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/features/settings";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
