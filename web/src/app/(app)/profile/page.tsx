import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileView } from "@/components/features/profile";

// Rendered client-side after the session check in the (app) shell, so it cannot be prerendered.
export const instant = false;

export const metadata: Metadata = { title: "Profile" };

export default function Page() {
  return (
    <Suspense>
      <ProfileView />
    </Suspense>
  );
}
