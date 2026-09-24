"use client";

import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

/* Suspense fallback for /repos/:repoId/pulls (and its nested PR detail route
   until that segment ships its own loading.tsx) — neutral skeleton in the shell. */
export default function PullsLoading() {
  return (
    <AppShell>
      <div style={s.loadingStack}>
        <Skeleton height={24} width={240} />
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    </AppShell>
  );
}
