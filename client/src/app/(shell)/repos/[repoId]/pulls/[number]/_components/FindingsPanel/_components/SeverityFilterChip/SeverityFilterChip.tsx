"use client";

import { Icon, SEV, type Severity } from "@devdigest/ui";
import { s } from "./styles";

/**
 * One severity-count pill for the FindingsPanel toolbar. Click toggles that
 * severity as the active filter (parent owns the toggle-off logic).
 */
export function SeverityFilterChip({
  severity,
  count,
  active,
  onClick,
}: {
  severity: Severity;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const sev = SEV[severity];
  const I = Icon[sev.icon];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={s.chip(sev.c, sev.bg, active)}
    >
      <I size={12.5} />
      <span className="tnum">{count}</span>
      {sev.label}
    </button>
  );
}
