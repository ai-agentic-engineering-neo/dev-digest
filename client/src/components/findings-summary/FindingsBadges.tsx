/* FindingsBadges — one compact severity badge (icon + count) per non-zero
   severity, with a hover/focus FindingsTooltip listing the findings. Ported from
   the design's FindingsCell (PR list FINDINGS column) and RunFindings (timeline
   row). No findings — or no review yet — renders "—". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import type { FindingsSummary, Severity } from "@devdigest/shared";
import { FindingsTooltip, type TooltipPosition } from "./FindingsTooltip";
import { s, TOOLTIP_WIDTH } from "./styles";

const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
const GAP = 6;
const EDGE = 8;
/** Grace period so the pointer can cross the gap from trigger to tooltip. */
const CLOSE_DELAY_MS = 120;

function positionFor(el: HTMLElement): TooltipPosition {
  const r = el.getBoundingClientRect();
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - TOOLTIP_WIDTH - EDGE));
  // Flip above when the trigger sits in the lower half of the viewport.
  const above = r.bottom > window.innerHeight / 2;
  return { top: above ? r.top - GAP : r.bottom + GAP, left, above };
}

export function FindingsBadges({ summary }: { summary: FindingsSummary | null | undefined }) {
  const t = useTranslations("common");
  const tooltipId = React.useId();
  const ref = React.useRef<HTMLSpanElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = React.useState<TooltipPosition | null>(null);

  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const total = summary ? SEVERITIES.reduce((n, sev) => n + summary.counts[sev], 0) : 0;
  if (!summary || total === 0) return <span style={s.empty}>—</span>;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const open = () => {
    cancelClose();
    if (ref.current) setPosition(positionFor(ref.current));
  };
  const close = () => {
    cancelClose();
    setPosition(null);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };

  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-describedby={position ? tooltipId : undefined}
      aria-label={t("findingsSummary.title", { count: total })}
      style={s.trigger(summary.items.length > 0)}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {SEVERITIES.filter((sev) => summary.counts[sev] > 0).map((sev) => (
        <span key={sev} data-severity={sev}>
          <SeverityBadge severity={sev} count={summary.counts[sev]} compact />
        </span>
      ))}
      {position && summary.items.length > 0 && (
        <FindingsTooltip
          id={tooltipId}
          items={summary.items}
          position={position}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
    </span>
  );
}
