/* PrFindingsCell — FINDINGS column of the PR list: severity counts of the PR's
   latest review (server-aggregated on PrMeta), and on hover a read-only popover
   with that review's findings, fetched lazily from GET /pulls/:id/reviews. */
"use client";

import React from "react";
import type { PrMeta } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks";
import { FindingsHover, countsFromMap } from "@/components/findings-hover";
import { s } from "../../styles";

export function PrFindingsCell({ pr, up = false }: { pr: PrMeta; up?: boolean }) {
  const [wanted, setWanted] = React.useState(false);
  const reviews = usePrReviews(pr.id, { enabled: wanted });
  const counts = countsFromMap(pr.findings_counts);
  if (counts.length === 0) return <span style={s.muted}>—</span>;
  const items = reviews.data?.find((r) => r.id === pr.latest_review_id)?.findings;
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

export default PrFindingsCell;
