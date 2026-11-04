/* SeverityTally — "⬣ 2  ⚠ 3  💡 1": icon + count per severity, ONLY levels with findings.
   Used on the PR list FINDINGS column and on Timeline run tiles so you see at a glance
   what a run found. Renders nothing when every level is zero (the caller decides what
   "clean" looks like). i18n-free (mounted in /showcase): the caller passes `label`. */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { nonZeroLevels, type SeverityCounts } from "./helpers";
import { s } from "./styles";

export type SeverityTallyProps = {
  counts: SeverityCounts;
  /** Accessible name of one chip, e.g. (CRITICAL, 2) → "2 critical". Defaults to "CRITICAL 2". */
  label?: (severity: Severity, count: number) => string;
};

export function SeverityTally({ counts, label }: SeverityTallyProps) {
  const levels = nonZeroLevels(counts);
  if (levels.length === 0) return null;
  return (
    <span style={s.group} data-testid="severity-tally">
      {levels.map((sev) => {
        const n = counts[sev] ?? 0;
        const name = label ? label(sev, n) : `${sev} ${n}`;
        return (
          <span key={sev} role="img" aria-label={name} title={name}>
            <SeverityBadge severity={sev} count={n} compact />
          </span>
        );
      })}
    </span>
  );
}

export default SeverityTally;
