/* SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" row above the
   Review runs list. Click a chip to filter every run down to that severity;
   click the active chip again to clear back to all. */
"use client";

import React from "react";
import { Chip, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";

const SEVERITY_LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

export function SeverityCounters({
  findings,
  active,
  onSelect,
}: {
  findings: FindingRecord[];
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  if (findings.length === 0) return null;
  const counts = countBySeverity(findings);

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {SEVERITY_LEVELS.map((sev) => {
        const meta = SEV[sev];
        return (
          <Chip
            key={sev}
            icon={meta.icon}
            color={meta.c}
            count={counts[sev]}
            active={active === sev}
            onClick={() => onSelect(active === sev ? null : sev)}
          >
            {meta.label.toUpperCase()}
          </Chip>
        );
      })}
    </div>
  );
}
