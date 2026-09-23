/* SeverityFilterButtons — the three Critical/Warning/Suggestion filter
   buttons under a review run's SeverityPills row. Always renders all three
   (even at count 0) so the control never rearranges itself; clicking the
   already-active one clears the filter. This is the ONLY clickable filter
   control on the PR-detail page — the pills above it are pure display. See
   client/specs/severity-filter.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";

export function SeverityFilterButtons({
  active,
  onSelect,
}: {
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div
      role="group"
      aria-label={t("severity.filterGroupAria")}
      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
    >
      {SEVERITY_LEVELS.map((sev) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const isActive = active === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? null : sev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all .12s",
              border: `1px solid ${isActive ? meta.c : "var(--border)"}`,
              background: isActive ? meta.bg : "transparent",
              color: isActive ? meta.c : "var(--text-secondary)",
            }}
          >
            <I size={13} />
            {t(`severity.${sev.toLowerCase()}`)}
          </button>
        );
      })}
    </div>
  );
}

export default SeverityFilterButtons;
