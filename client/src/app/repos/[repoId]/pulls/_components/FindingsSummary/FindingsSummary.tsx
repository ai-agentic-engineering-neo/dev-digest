/* FindingsSummary — PR-list FINDINGS column. Compact severity icons (only the
   severities actually present); hovering shows a read-only popover
   ("N FINDINGS IN THIS RUN") previewing each finding — no accept/reject here,
   that lives on the PR-detail Review-runs accordion (FindingCard). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity as UiSeverity, type Category } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { severityCounts, FILTERABLE_SEVERITIES, lineLabel } from "@/lib/findings";
import { sortedFindings, shortDescription } from "./helpers";
import { s } from "./styles";

function FindingPreviewCard({ f }: { f: Finding }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <SeverityBadge severity={f.severity as UiSeverity} compact />
        <span style={s.cardTitle}>{f.title}</span>
      </div>
      <div style={s.cardMeta}>
        <CategoryTag category={f.category as Category} />
        <span className="mono">
          {f.file}:{lineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      <p style={s.cardDescription}>{shortDescription(f.rationale)}</p>
    </div>
  );
}

export function FindingsSummary({ findings }: { findings: Finding[] }) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);

  if (findings.length === 0) return <span style={s.muted}>—</span>;

  const counts = severityCounts(findings);
  const present = FILTERABLE_SEVERITIES.filter((sev) => counts[sev] > 0);
  const ordered = sortedFindings(findings);

  return (
    <div
      style={s.wrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={s.trigger}>
        {present.map((sev) => (
          <SeverityBadge key={sev} severity={sev as UiSeverity} count={counts[sev]} compact />
        ))}
      </div>
      {hover && (
        <div style={s.popover} onClick={(e) => e.stopPropagation()}>
          <div style={s.popoverTitle}>{t("list.findingsPopover.title", { count: findings.length })}</div>
          <div style={s.list}>
            {ordered.map((f) => (
              <FindingPreviewCard key={f.id} f={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FindingsSummary;
