/* SeverityFilter — one counter per severity above a run's findings (M1).
   "1 CRITICAL  3 WARNING  1 SUGGESTION": a click keeps only that level in the
   list, a second click on the active level clears the filter. Counts come from
   the findings already loaded; clicking sends no request. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_FILTERS } from "../../../constants";
import { s } from "./styles";

export interface SeverityFilterProps {
  /** Findings per level in the list the counters sit above. */
  counts: Record<Severity, number>;
  /** The level the list is filtered to, or null when the filter is off. */
  active: Severity | null;
  onChange: (next: Severity | null) => void;
}

export function SeverityFilter({ counts, active, onChange }: SeverityFilterProps) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.row}>
      {SEVERITY_FILTERS.map((severity) => {
        const count = counts[severity];
        const isActive = active === severity;
        // An empty level cannot be picked, but the active one stays clickable:
        // "Hide low confidence" can empty it, and the filter must still clear.
        const disabled = count === 0 && !isActive;
        return (
          <button
            key={severity}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(isActive ? null : severity)}
            style={s.counter(SEV[severity].c, {
              active: isActive,
              dimmed: disabled || (active !== null && !isActive),
              disabled,
            })}
          >
            {t(`panel.severity.${severity}`, { count })}
          </button>
        );
      })}
    </div>
  );
}

export default SeverityFilter;
