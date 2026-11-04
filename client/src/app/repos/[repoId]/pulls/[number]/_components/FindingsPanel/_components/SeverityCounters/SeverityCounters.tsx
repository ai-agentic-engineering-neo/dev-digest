/* SeverityCounters — "CRITICAL 3 · WARNING 5 · SUGGESTION 2" filter buttons for one run's findings.
   i18n-free by design: /showcase renders it without an intl provider, so callers pass `labels`.
   Spec: client/specs/severity-counters.md */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

/** Contract order (`Severity` enum) — most severe first. */
export const COUNTER_LEVELS: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export interface SeverityCountersProps {
  counts: Record<Severity, number>;
  /** Currently shown level, or null when all levels are shown. */
  active: Severity | null;
  /** Called with the clicked level, or null when the active level is clicked again (= show all). */
  onSelect: (severity: Severity | null) => void;
  labels: {
    /** Accessible name of the button group. */
    group: string;
    /** Tooltip / accessible name of one button, e.g. "Show only CRITICAL findings". */
    showOnly: (severity: Severity) => string;
  };
}

export function SeverityCounters({ counts, active, onSelect, labels }: SeverityCountersProps) {
  return (
    <div role="group" aria-label={labels.group} style={s.group}>
      {/* Only levels with findings are shown — zero levels are hidden so the toolbar
          says at a glance what this run found (FindingsPanel resets the filter if the
          active level drops to 0). */}
      {COUNTER_LEVELS.filter((sev) => (counts[sev] ?? 0) > 0).map((sev) => {
        const count = counts[sev] ?? 0;
        const pressed = active === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={pressed}
            title={labels.showOnly(sev)}
            aria-label={`${labels.showOnly(sev)} (${count})`}
            onClick={() => onSelect(pressed ? null : sev)}
            style={s.button({ pressed, dimmed: active !== null && !pressed })}
          >
            <SeverityBadge severity={sev} count={count} />
          </button>
        );
      })}
    </div>
  );
}

export default SeverityCounters;
