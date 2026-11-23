/* SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" row above a run's
   finding list. Pure presentational: counts come from already-loaded findings,
   clicking only toggles the parent's local severity filter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "../../constants";
import { s, counterStyle } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (sev: Severity) => void;
}) {
  const t = useTranslations("prReview");

  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.row}>
      {SEVERITY_LEVELS.map((sev, i) => {
        const count = counts[sev] ?? 0;
        const isActive = active === sev;
        const disabled = count === 0 && !isActive;
        const dimmed = disabled || (active !== null && !isActive);
        const I = Icon[SEV[sev].icon];
        return (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span aria-hidden style={s.separator}>
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => onToggle(sev)}
              style={counterStyle(sev, isActive, dimmed, disabled)}
            >
              <I size={12.5} aria-hidden />
              <span className="tnum">
                {t("panel.severityCount", { count, level: t(`panel.severity.${sev}`) })}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
