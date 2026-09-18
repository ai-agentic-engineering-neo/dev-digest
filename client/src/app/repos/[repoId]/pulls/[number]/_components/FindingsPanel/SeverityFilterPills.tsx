/* SeverityFilterPills — "N CRITICAL · N WARNING · N SUGGESTION" row shown
   directly under the run's VerdictBanner. Only severities actually present
   get a pill; clicking one filters the finding-cards below to just that
   severity, clicking it again (or Escape, handled by the parent) clears it. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

export function SeverityFilterPills({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (sev: Severity) => void;
}) {
  const present = (Object.keys(counts) as Severity[]).filter((sev) => counts[sev] > 0);
  if (present.length === 0) return null;

  return (
    <div style={s.pillRow} role="group" aria-label="Filter findings by severity">
      {present.map((sev, i) => {
        const tok = SEV[sev];
        const SevIcon = Icon[tok.icon];
        const isActive = active === sev;
        return (
          <React.Fragment key={sev}>
            {i > 0 && <span style={s.pillSep}>·</span>}
            <button
              type="button"
              onClick={() => onToggle(sev)}
              aria-pressed={isActive}
              style={s.pill(tok.c, tok.bg, isActive)}
            >
              <SevIcon size={13} />
              <span className="tnum">{counts[sev]}</span>
              <span>{sev}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
