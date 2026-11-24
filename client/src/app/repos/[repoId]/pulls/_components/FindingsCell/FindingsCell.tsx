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
import { SEVERITY_FILTERS } from "../../[number]/_components/FindingsPanel/constants";
import { latestFindingsPerAgent, totalFindings } from "../../helpers";
import { POPOVER_MIN_ROOM, POPOVER_WIDTH, VIEWPORT_MARGIN } from "./constants";
import { FindingsPopover } from "./FindingsPopover";
import { s, type PopoverAnchor } from "./styles";

/** Pin the preview under the cell, or above it when there is no room below. */
function anchorFor(cell: HTMLElement): PopoverAnchor {
  const rect = cell.getBoundingClientRect();
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
  );
  const roomBelow = window.innerHeight - rect.bottom;
  return roomBelow < POPOVER_MIN_ROOM && rect.top > roomBelow
    ? { left, bottom: window.innerHeight - rect.top }
    : { left, top: rect.bottom };
}

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

  const open = (e: React.SyntheticEvent<HTMLElement>) => setAnchor(anchorFor(e.currentTarget));
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
