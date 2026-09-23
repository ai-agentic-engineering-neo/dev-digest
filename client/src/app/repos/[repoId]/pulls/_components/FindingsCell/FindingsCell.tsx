/* FindingsCell — the PR list's FINDINGS column: per-severity chips of the latest
   review (the one behind SCORE and COST), "—" when never reviewed, "0" when that
   review found nothing. The hover popover's findings load on the first hover
   (server/specs/02-findings-by-severity.md) — which also warms the PR page. */
"use client";

import React from "react";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SeverityCounts, totalOf } from "@/components/severity-counts";
import { s } from "../../styles";

export function FindingsCell({ pr, repoFullName }: { pr: PrMeta; repoFullName?: string | null }) {
  const [wanted, setWanted] = React.useState(false);
  const { data: reviews, isLoading, isError } = usePrReviews(wanted ? pr.id : null);

  const counts = pr.findings_by_severity;
  if (counts == null) return <span style={s.muted}>—</span>;
  if (totalOf(counts) === 0) return <span style={s.muted}>0</span>;

  // Reviews come newest-first, as on the server → the first `review` is the one
  // these counts belong to.
  const latest = reviews?.find((r) => r.kind === "review");
  return (
    <SeverityCounts
      counts={counts}
      findings={reviews ? latest?.findings ?? [] : undefined}
      loading={isLoading}
      error={isError}
      onHoverStart={() => setWanted(true)}
      repoFullName={repoFullName}
      headSha={pr.head_sha}
    />
  );
}
