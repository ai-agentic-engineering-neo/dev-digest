/* FindingsCell — the PR list's FINDINGS column: a severity breakdown of the
   latest review that opens the full findings list on click. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Popover } from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import {
  FindingsList,
  SeverityCountBadges,
  latestPerAgentFindings,
  totalFindings,
} from "@/components/findings-list";
import { usePrReviews } from "@/lib/hooks";
import { s } from "../../styles";

export function FindingsCell({
  prId,
  counts,
}: {
  prId: string | null | undefined;
  /** null ⇒ never reviewed. */
  counts: SeverityCounts | null | undefined;
}) {
  const t = useTranslations("prReview");
  // Latches on first open: deferred so the list doesn't fetch reviews for every
  // row, but not un-fetched on close, so reopening is instant from cache.
  const [opened, setOpened] = React.useState(false);
  const { data: reviews, isLoading } = usePrReviews(prId, opened);

  const total = counts ? totalFindings(counts) : 0;
  if (!counts || total === 0) return <span style={s.muted}>—</span>;

  // `counts` unions each agent's latest review server-side, so the panel has
  // to list that same set — not `reviews[0]`, which is just whichever agent
  // finished last.
  const listed = React.useMemo(() => latestPerAgentFindings(reviews ?? []), [reviews]);

  return (
    <div style={s.findingsCell}>
      <Popover
        label={t("findings.open", { count: total })}
        trigger={<SeverityCountBadges counts={counts} />}
        width={520}
        onOpenChange={(isOpen) => isOpen && setOpened(true)}
      >
        <FindingsList findings={listed} loading={isLoading} scope="pr" />
      </Popover>
    </div>
  );
}
