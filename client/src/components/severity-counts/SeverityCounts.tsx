/* SeverityCounts — the per-severity finding chips (e.g. "⛔2 ⚠1 💡3").
   One cluster, three callers:
     PR list FINDINGS column  — compact, read-only
     findings panel toolbar   — full labels, clickable (filters the list below)
     PR detail run timeline   — compact, read-only
   Severities with a zero count are omitted, and an all-zero tally renders
   nothing at all — the caller decides what "no findings" looks like. */
"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import { SEVERITIES, type SeverityCountMap } from "./helpers";
import { s } from "./styles";

export function SeverityCounts({
  counts,
  compact,
  active,
  onSelect,
  label,
  titleFor,
}: {
  counts: SeverityCountMap | null | undefined;
  /** Icon + number only, no severity label (the list and the timeline). */
  compact?: boolean;
  /** Severity currently filtered on, when the chips are interactive. */
  active?: string | null;
  /** Given → the chips become buttons; omitted → they are static text. */
  onSelect?: (severity: string) => void;
  /** Group aria-label. */
  label?: string;
  /** Per-chip tooltip, e.g. "Show only CRITICAL findings". */
  titleFor?: (severity: string, isActive: boolean) => string;
}) {
  const shown = SEVERITIES.filter((sev) => (counts?.[sev] ?? 0) > 0);
  if (shown.length === 0) return null;

  const badge = (sev: string) => (
    <SeverityBadge severity={sev as Severity} count={counts![sev]} compact={compact} />
  );

  // A compact chip is an icon + a number, which says nothing on its own to a
  // screen reader or on hover — so every static chip carries its severity name.
  if (!onSelect) {
    return (
      <span style={s.group} aria-label={label}>
        {shown.map((sev) => (
          <span key={sev} title={titleFor?.(sev, false) ?? sev} style={s.chip}>
            {badge(sev)}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div style={s.group} role="group" aria-label={label}>
      {shown.map((sev) => {
        const isActive = active === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            title={titleFor?.(sev, isActive)}
            onClick={() => onSelect(sev)}
            style={{
              ...s.button,
              ...(isActive ? s.buttonActive : {}),
              ...(active && !isActive ? s.buttonMuted : {}),
            }}
          >
            {badge(sev)}
          </button>
        );
      })}
    </div>
  );
}

export default SeverityCounts;
