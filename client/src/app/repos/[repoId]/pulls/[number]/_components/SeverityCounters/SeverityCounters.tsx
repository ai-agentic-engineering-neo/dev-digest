/* SeverityCounters — PR-wide "3 CRITICAL · 5 WARNING · 2 SUGGESTION" row.
   Clicking a severity filters the Findings tab to just that severity;
   clicking the active one again clears the filter. */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SEVERITY_ORDER } from "../FindingsPanel/constants";
import { s } from "./styles";

export function SeverityCounters({
  findings,
  active,
  onChange,
}: {
  findings: FindingRecord[];
  active: Severity | null;
  onChange: (severity: Severity | null) => void;
}) {
  const counts = React.useMemo(() => {
    const m = new Map<Severity, number>();
    for (const f of findings) m.set(f.severity, (m.get(f.severity) ?? 0) + 1);
    return [...m.entries()].sort(
      (a, b) => (SEVERITY_ORDER[a[0]] ?? 9) - (SEVERITY_ORDER[b[0]] ?? 9),
    );
  }, [findings]);

  if (counts.length === 0) return null;

  return (
    <div style={s.row}>
      {counts.map(([severity, count]) => (
        <SeverityBadge
          key={severity}
          severity={severity}
          count={count}
          onClick={() => onChange(active === severity ? null : severity)}
          active={active == null ? undefined : active === severity}
        />
      ))}
    </div>
  );
}
