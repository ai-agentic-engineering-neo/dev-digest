/* SeverityPills — the "N CRITICAL · N WARNING · N SUGGESTION" breakdown row.
   Shared across the PR list (FINDINGS column, compact) and PR detail (Timeline
   tiles + each review run's header, both read-only). Never renders a zero
   count. Never clickable on its own: pass `onSelect` only where a click should
   DO something (the PR list navigates to the filtered detail view) — every
   other call site renders plain, non-interactive spans. See
   client/specs/severity-filter.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";

export function SeverityPills({
  counts,
  compact = false,
  onSelect,
}: {
  counts: Partial<Record<Severity, number>> | null | undefined;
  /** Icon + count only, no severity label (PR list, Timeline tiles). */
  compact?: boolean;
  /** When set, each pill becomes a real button that calls back with its
   *  severity — used only by the PR list, where a click navigates. */
  onSelect?: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const levels = SEVERITY_LEVELS.filter((sev) => (counts?.[sev] ?? 0) > 0);
  if (levels.length === 0) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {levels.map((sev) =>
        onSelect ? (
          <button
            key={sev}
            type="button"
            onClick={(e) => {
              // The PR-list row itself is a click target (navigates to the
              // PR) — stop the pill's click from also firing that navigation.
              e.stopPropagation();
              onSelect(sev);
            }}
            aria-label={t("severity.filterAria", { severity: t(`severity.${sev.toLowerCase()}`) })}
            style={{
              display: "inline-flex",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <SeverityBadge severity={sev} count={counts?.[sev] ?? 0} compact={compact} />
          </button>
        ) : (
          <span key={sev} style={{ display: "inline-flex" }}>
            <SeverityBadge severity={sev} count={counts?.[sev] ?? 0} compact={compact} />
          </span>
        ),
      )}
    </div>
  );
}

export default SeverityPills;
