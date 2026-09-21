/* SeverityCounts — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" for one run.
   Only severities that occur get a pill; each pill toggles the severity filter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

export function SeverityCounts({
  counts,
  active,
  onToggle,
}: {
  counts: { severity: Severity; count: number }[];
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  if (counts.length === 0) return null;
  return (
    <div role="group" aria-label={t("panel.countsLabel")} style={s.counters}>
      {counts.map(({ severity, count }, i) => {
        const sev = SEV[severity];
        const I = Icon[sev.icon];
        const on = active === severity;
        return (
          <React.Fragment key={severity}>
            {i > 0 && <span style={s.counterSep}>·</span>}
            <button
              type="button"
              aria-pressed={on}
              aria-label={t("panel.countAria", { count, severity: severity.toLowerCase() })}
              onClick={() => onToggle(severity)}
              style={{ ...s.counterPill, color: sev.c, background: sev.bg, borderColor: on ? sev.c : "transparent" }}
            >
              <I size={12.5} />
              <span className="tnum">{count}</span>
              {severity}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
