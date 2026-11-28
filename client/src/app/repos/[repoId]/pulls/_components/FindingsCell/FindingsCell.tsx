/* FindingsCell — the PR list's FINDINGS column (M1). One chip per severity
   that has findings (icon + count), summed over each agent's latest review
   (`PrMeta.findings_counts`). Hover or keyboard focus opens a preview of those
   findings; the reviews are requested only then. A click opens the PR's Agent
   runs tab. A PR without findings shows "—". */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SEVERITY_FILTERS } from "../../constants";
import { latestFindingsPerAgent, totalFindings } from "../../helpers";
import { FindingsPopover } from "./FindingsPopover";
import { popoverAnchor } from "./helpers";
import { s, type PopoverAnchor } from "./styles";

export function FindingsCell({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const popoverId = React.useId();
  const [anchor, setAnchor] = React.useState<PopoverAnchor | null>(null);
  const counts = pr.findings_counts;
  const total = totalFindings(counts);

  // Disabled (null id) until the preview opens, so the list itself sends no
  // per-PR request. TanStack Query caches the result for the next hover.
  const { data: reviews, isError } = usePrReviews(anchor && total > 0 ? pr.id : null);
  const findings = React.useMemo(
    () => (reviews ? latestFindingsPerAgent(reviews) : undefined),
    [reviews],
  );

  // The preview is pinned in viewport coordinates, so it would drift away from
  // its cell when the page scrolls. Close it instead.
  React.useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  if (!counts || total === 0) return <span style={s.muted}>—</span>;

  const open = (e: React.SyntheticEvent<HTMLElement>) => setAnchor(
      popoverAnchor(e.currentTarget.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  const goToRuns = () => router.push(`/repos/${repoId}/pulls/${pr.number}?tab=findings`);

  return (
    <div
      data-testid="findings-cell"
      role="link"
      tabIndex={0}
      aria-label={t("list.findingsLabel", {
        critical: counts.CRITICAL,
        warning: counts.WARNING,
        suggestion: counts.SUGGESTION,
      })}
      aria-describedby={anchor ? popoverId : undefined}
      style={s.cell}
      onMouseEnter={open}
      onMouseLeave={() => setAnchor(null)}
      onFocus={open}
      onBlur={() => setAnchor(null)}
      onClick={(e) => {
        e.stopPropagation(); // the row's own click opens the PR overview
        goToRuns();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAnchor(null);
        if (e.key === "Enter") {
          e.stopPropagation();
          goToRuns();
        }
      }}
    >
      {SEVERITY_FILTERS.filter((severity) => counts[severity] > 0).map((severity) => (
        <span key={severity} data-testid={`findings-chip-${severity}`}>
          <SeverityBadge severity={severity} count={counts[severity]} compact />
        </span>
      ))}
      {anchor && (
        <FindingsPopover
          id={popoverId}
          anchor={anchor}
          findings={findings}
          expectedCount={total}
          isError={isError}
        />
      )}
    </div>
  );
}

export default FindingsCell;
