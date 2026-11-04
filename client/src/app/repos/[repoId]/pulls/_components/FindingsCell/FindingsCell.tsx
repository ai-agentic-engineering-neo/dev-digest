/* FindingsCell — PR list FINDINGS column: severity icons + counts of the latest run's
   findings; hovering (or focusing) it opens a "FINDINGS IN THIS RUN" popover with short
   cards (severity · title · file:line), so the PR's picture is visible before opening it.
   i18n-free (mounted in /showcase): the caller passes `labels`.
   Spec: client/specs/pr-list-findings.md */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SeverityTally } from "@/components/severity-tally";
import { placePopover, toCounts, totalOf, type PrFindings } from "./helpers";
import { s } from "./styles";

export type FindingsCellLabels = {
  /** Popover heading, e.g. "Findings in this run". */
  heading: string;
  /** Shown when the latest run found nothing, e.g. "Clean". */
  none: string;
  /** Footer when there are more findings than cards, e.g. (3) → "+3 more on the PR page". */
  more: (count: number) => string;
  /** Accessible name of one severity chip, e.g. (CRITICAL, 2) → "2 critical". */
  chip: (severity: Severity, count: number) => string;
};

export type FindingsCellProps = {
  /** `PrMeta.findings` — null/undefined = never reviewed. */
  findings: PrFindings | null | undefined;
  labels: FindingsCellLabels;
};

export function FindingsCell({ findings, labels }: FindingsCellProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [pos, setPos] = React.useState<ReturnType<typeof placePopover> | null>(null);
  const popoverId = React.useId();

  if (!findings) return <span style={s.muted}>—</span>;
  const total = totalOf(findings);
  if (total === 0) return <span style={s.clean}>{labels.none}</span>;

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(placePopover(r, { width: window.innerWidth, height: window.innerHeight }));
  };
  const close = () => setPos(null);
  const rest = total - findings.top.length;

  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-describedby={pos ? popoverId : undefined}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      style={s.trigger}
      data-testid="findings-cell"
    >
      <SeverityTally counts={toCounts(findings)} label={labels.chip} />
      {pos && (
        <div id={popoverId} role="tooltip" style={s.popover(pos)}>
          <div style={s.heading}>{labels.heading}</div>
          <ul style={s.list}>
            {findings.top.map((f, i) => (
              <li key={`${f.file}:${f.start_line}:${i}`} style={s.card}>
                <SeverityBadge severity={f.severity} compact />
                <div style={s.cardBody}>
                  <span style={s.cardTitle} title={f.title}>
                    {f.title}
                  </span>
                  <span className="mono" style={s.cardLoc} title={`${f.file}:${f.start_line}`}>
                    {f.file}:{f.start_line}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {rest > 0 && <div style={s.more}>{labels.more(rest)}</div>}
        </div>
      )}
    </span>
  );
}

export default FindingsCell;
