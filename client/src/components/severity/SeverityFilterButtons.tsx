/* SeverityFilterButtons — the severity row inside an opened review run. It is
   the counter AND the filter in one control: icon + label + count, one chip
   per severity the run actually has. Clicking the active chip clears the
   filter. A severity with zero findings is not rendered, so the row can't
   offer a filter that leads to an empty list. Purely-reporting surfaces (PR
   list column, Timeline tiles) use `SeverityPills` instead — that one is a
   compact badge, not a control. See client/specs/severity-filter.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";

export function SeverityFilterButtons({
  counts,
  active,
  onSelect,
}: {
  /** Findings per severity for THIS run, already tallied by the caller from
   *  the same array it is about to render (so chip count == cards below). */
  counts: Partial<Record<Severity, number>> | null | undefined;
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  const levels = SEVERITY_LEVELS.filter((sev) => (counts?.[sev] ?? 0) > 0);
  if (levels.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t("severity.filterGroupAria")}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {levels.map((sev) => {
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
              gap: 7,
              padding: "5px 12px",
              borderRadius: 999,
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
            {/* Dimmed so the chip reads "Critical, 2 of them", not "Critical 2"
                as one label — and `tnum` keeps widths stable as counts change. */}
            <span className="tnum" style={{ fontWeight: 600, opacity: 0.65 }}>
              {counts?.[sev] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default SeverityFilterButtons;
