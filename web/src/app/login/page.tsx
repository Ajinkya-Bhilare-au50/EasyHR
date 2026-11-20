import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/components/features/login";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
