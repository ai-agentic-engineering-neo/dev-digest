"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";
import { s } from "./styles";

/** Per-severity counters; clicking a level toggles the filter. Active state is
 *  shown by color (not hover), so it is readable from a screenshot. */
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
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.counterRow}>
      {SEVERITY_LEVELS.map((sev, i) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const isActive = active === sev;
        return (
          <React.Fragment key={sev}>
            {i > 0 && <span aria-hidden style={s.counterSep}>·</span>}
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(sev)}
              style={{
                ...s.counterBtn,
                color: meta.c,
                background: isActive ? meta.bg : "transparent",
                borderColor: isActive ? meta.c : "transparent",
                opacity: active && !isActive ? 0.45 : 1,
              }}
            >
              <I size={12.5} />
              <span className="tnum">{counts[sev]}</span>
              {t(`panel.severity.${sev}`)}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
