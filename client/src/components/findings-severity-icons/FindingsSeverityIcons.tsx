/* FindingsSeverityIcons — compact per-severity count badges (e.g. the row
   under an agent run's name, or the PR list's Findings column), with one
   combined hover popover listing every finding (all severities mixed), each
   with a one-line description.

   Two data sources:
   - "eager": the findings are already loaded (e.g. the PR detail page has
     the ReviewRecord in hand) — passed straight through.
   - "lazy": only the PR id is known (the PR list doesn't fetch full findings
     to keep the list payload light) — the popover fetches them itself via
     usePrReviews on first hover, then reuses the cached result. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Popover, SeverityBadge } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SEVERITY_ORDER } from "@/lib/severity";

export type FindingsCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

type FindingsSource =
  | { kind: "eager"; findings: FindingRecord[] | null }
  | { kind: "lazy"; prId: string };

/** The findings of the single most recent 'review'-kind review — matches how
 *  the server computes `counts` (latest-review-wins), so the popover body
 *  and the badge numbers never disagree. */
function latestReviewFindings(reviews: { kind: string; created_at: string; findings: FindingRecord[] }[]) {
  const reviewed = reviews.filter((r) => r.kind === "review");
  if (reviewed.length === 0) return [];
  return reviewed.reduce((latest, r) =>
    Date.parse(r.created_at) > Date.parse(latest.created_at) ? r : latest,
  ).findings;
}

export function FindingsSeverityIcons({
  counts,
  source,
  popoverAlign = "left",
  popoverStrategy = "absolute",
}: {
  counts: FindingsCounts | null;
  source: FindingsSource;
  popoverAlign?: "left" | "right";
  popoverStrategy?: "absolute" | "fixed";
}) {
  const t = useTranslations("prReview");
  const [wantsFetch, setWantsFetch] = React.useState(source.kind === "eager");
  const lazyPrId = source.kind === "lazy" ? source.prId : null;
  const { data: lazyReviews } = usePrReviews(wantsFetch ? lazyPrId : null);

  const entries = React.useMemo(() => {
    if (!counts) return [];
    return (Object.entries(counts) as [keyof FindingsCounts, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => (SEVERITY_ORDER[a[0]] ?? 9) - (SEVERITY_ORDER[b[0]] ?? 9));
  }, [counts]);

  if (entries.length === 0) return null;

  const findings: FindingRecord[] | null =
    source.kind === "eager" ? source.findings : lazyReviews ? latestReviewFindings(lazyReviews) : null;

  return (
    <Popover
      align={popoverAlign}
      strategy={popoverStrategy}
      trigger={
        <div
          onMouseEnter={() => setWantsFetch(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {entries.map(([severity, count]) => (
            <SeverityBadge key={severity} severity={severity} count={count} compact />
          ))}
        </div>
      }
      content={
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {t("findingsPopover.title", { count: findings?.length ?? entries.reduce((n, [, c]) => n + c, 0) })}
          </div>
          {findings == null ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("findingsPopover.loading")}</div>
          ) : (
            findings.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}>
                  <SeverityBadge severity={f.severity} compact />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {f.rationale}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      }
    />
  );
}

export default FindingsSeverityIcons;
