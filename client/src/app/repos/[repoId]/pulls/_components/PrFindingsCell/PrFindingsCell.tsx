/* PrFindingsCell — FINDINGS column of the PR list: severity counts summed over
   each agent's newest review (server-aggregated on PrMeta), and on hover a
   read-only popover with those findings, fetched lazily from
   GET /pulls/:id/reviews. */
"use client";

import React from "react";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks";
import { FindingsHover, countsFromMap } from "@/components/findings-hover";
import { currentReviewFindings } from "../../helpers";
import { s } from "../../styles";

export function PrFindingsCell({ pr, up = false }: { pr: PrMeta; up?: boolean }) {
  const [wanted, setWanted] = React.useState(false);
  const reviews = usePrReviews(pr.id, { enabled: wanted });
  const items = React.useMemo(
    () => (reviews.data ? currentReviewFindings(reviews.data, pr) : undefined),
    [reviews.data, pr],
  );
  const counts = countsFromMap(pr.findings_counts);
  if (counts.length === 0) return <span style={s.muted}>—</span>;
  return (
    <FindingsHover
      counts={counts}
      items={items}
      loading={reviews.isLoading}
      onShow={() => setWanted(true)}
      up={up}
      width={360}
    />
  );
}

