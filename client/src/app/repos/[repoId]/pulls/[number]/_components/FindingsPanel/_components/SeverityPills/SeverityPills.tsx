/* SeverityPills — "N CRITICAL · N WARNING · N SUGGESTION" for one review run.
   Only non-zero severities render. Clicking a pill filters the findings list to
   that severity; clicking the active pill clears the filter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function SeverityPills({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const present = SEVERITIES.filter((sev) => counts[sev] > 0);
  if (present.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilter")} style={s.row}>
      {present.map((sev, i) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const pressed = active === sev;
        return (
          <React.Fragment key={sev}>
            {i > 0 && <span style={s.separator}>·</span>}
            <button
              type="button"
              data-severity={sev}
              aria-pressed={pressed}
              title={pressed ? t("panel.clearFilter") : undefined}
              onClick={() => onToggle(sev)}
              style={s.pill(meta.c, meta.bg, pressed, active != null && !pressed)}
            >
              <I size={12.5} />
              {t("panel.severityPill", { count: counts[sev], severity: meta.label })}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
