/* SeverityFilter — per-run counters ("3 CRITICAL · 5 WARNING · 2 SUGGESTION")
   that double as a single-select severity filter for that run's findings list.
   Pure UI: counts come from already-loaded findings; clicks never hit the API. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "../FindingsPanel/constants";
import { pillStyle, s, type PillState } from "./styles";

export function SeverityFilter({
  counts,
  active,
  onChange,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  /** Next filter value: a level, or `null` to clear (re-click on the active level). */
  onChange: (next: Severity | null) => void;
}) {
  const t = useTranslations("prReview.panel.severityFilter");

  return (
    <div role="group" aria-label={t("groupLabel")} style={s.group}>
      {SEVERITY_LEVELS.map((sev, i) => {
        const tone = SEV[sev];
        const I = Icon[tone.icon];
        const isActive = active === sev;
        const state: PillState = active === null ? "neutral" : isActive ? "active" : "muted";
        return (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span aria-hidden="true" style={s.separator}>
                {t("separator")}
              </span>
            )}
            <button
              type="button"
              aria-pressed={isActive}
              data-state={state}
              title={isActive ? t("clear") : t("show", { label: tone.label })}
              onClick={() => onChange(isActive ? null : sev)}
              style={pillStyle(sev, state)}
            >
              <I size={12.5} style={{ color: tone.c }} aria-hidden="true" />
              <span className="tnum" style={s.label}>
                {t("count", { count: counts[sev] ?? 0, label: tone.label })}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
