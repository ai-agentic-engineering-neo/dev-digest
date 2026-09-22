import { AppShell } from "@/components/app-shell";
import { PrDetailSkeleton } from "./_components/PrDetailSkeleton";

export default function PrDetailLoading() {
  return (
    <AppShell>
      <PrDetailSkeleton />
    </AppShell>
  );
}
