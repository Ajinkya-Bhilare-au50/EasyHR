import { TablePageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <TablePageSkeleton tabs={5} kpis={2} actions={1} />;
}
