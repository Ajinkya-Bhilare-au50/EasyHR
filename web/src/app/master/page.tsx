import type { Metadata } from "next";
import { MasterView } from "@/components/features/master";

export const metadata: Metadata = { title: "Master admin" };

export default function MasterPage() {
  return <MasterView />;
}
