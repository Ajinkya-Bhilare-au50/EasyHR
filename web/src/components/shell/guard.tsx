"use client";

import { ShieldX } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/feedback";
import { useAuth } from "./auth";

/** UI-level guard. The API enforces the same permissions; this only avoids showing a broken page. */
export function RequirePermission({ any, children }: { any: string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (any.some(can)) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={ShieldX}
        title="You don't have access to this page"
        description="Ask your HR administrator if you think you should."
        action={<Button variant="outline" href="/">Back to dashboard</Button>}
      />
    </Card>
  );
}
