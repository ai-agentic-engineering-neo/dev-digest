/* FindingsSummary — compact per-severity counters ("⓪2 ⚠1 💡3") with a hover
   popover listing the findings behind them. Used by the PR list's Findings
   column and the Agent-runs timeline. Colors/icons/labels come from SEV. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { COUNTED_SEVERITIES, type SeverityCountMap } from "./helpers";
import { s } from "./styles";

export function FindingsSummary({
  counts,
  findings,
  inRun = false,
  onHover,
}: {
  counts: SeverityCountMap;
  /** Findings for the popover; undefined while still loading. */
  findings: FindingRecord[] | undefined;
  /** Heading reads "N findings in this run" instead of "N findings". */
  inRun?: boolean;
  /** Called on first hover — lets the PR list fetch findings lazily. */
  onHover?: () => void;
}) {
  const t = useTranslations("prReview");
  const [anchor, setAnchor] = React.useState<DOMRect | null>(null);
  const levels = COUNTED_SEVERITIES.filter((sev) => counts[sev]);
  if (levels.length === 0) return null;
  const total = levels.reduce((n, sev) => n + (counts[sev] ?? 0), 0);

  return (
    <span
      style={s.wrap}
      onMouseEnter={(e) => {
        setAnchor(e.currentTarget.getBoundingClientRect());
        onHover?.();
      }}
      onMouseLeave={() => setAnchor(null)}
    >
      {levels.map((sev) => {
        const I = Icon[SEV[sev].icon];
        return (
          <span key={sev} style={s.count(SEV[sev].c)} aria-label={`${counts[sev]} ${SEV[sev].label}`}>
            <I size={12.5} />
            {counts[sev]}
          </span>
        );
      })}
      {/* position: fixed escapes the table card's overflow:hidden; it stays a DOM
          child so hovering it keeps the popover open. */}
      {anchor && (
        <div role="tooltip" style={s.popover(anchor)}>
          <div style={s.panel}>
            <div style={s.heading}>
              <Icon.Info size={12} />
              {t(inRun ? "findingsSummary.runHeading" : "findingsSummary.heading", { count: total })}
            </div>
            {findings === undefined ? (
              <div style={s.loading}>{t("findingsSummary.loading")}</div>
            ) : (
              findings.map((f) => (
                <div key={f.id} style={s.item}>
                  <div style={s.itemTitleRow}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.itemTitle}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={s.itemMeta}>
                    <span className="mono" style={s.file}>
                      {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div style={s.rationale}>{f.rationale}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}
