/* FindingsCell — the FINDINGS column cell on the PR list: compact severity
   pills (icon + count, tallied client-side from the latest round's previews)
   with a read-only hover popover listing those findings. Previews only — the
   actionable Accept/Reject cards live on the PR detail page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingPreview } from "@devdigest/shared";
import { SEVERITY_KEYS, countBySeverity } from "@/lib/severity";
import { s } from "./styles";

/** Hover intent: open after a beat; close slightly slower so moving the cursor
 *  across the gap into the popover doesn't dismiss it. */
const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 140;
const POPOVER_W = 360;
const HEADER_H = 44;

/** Severity display weight (lower = first), unknown values last. */
function severityWeight(sev: string): number {
  const i = (SEVERITY_KEYS as readonly string[]).indexOf(sev);
  return i === -1 ? 9 : i;
}

/** Viewport-anchored placement, computed from the cell's position at open
 *  time. `position: fixed` escapes the table card's overflow:hidden — an
 *  absolutely-positioned popover gets clipped on short tables, where neither
 *  "below the row" nor "above it" fits inside the card. Always opens toward
 *  the roomier side so the maxHeight never overflows the viewport. */
type Anchor = { left: number; top?: number; bottom?: number; maxHeight: number };

function anchorFor(cell: DOMRect): Anchor {
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(cell.right - POPOVER_W, window.innerWidth - POPOVER_W - 8));
  const below = vh - cell.bottom - 10;
  const above = cell.top - 10;
  const maxHeight = Math.max(120, Math.min(360, Math.max(below, above)));
  return below >= above
    ? { left, top: cell.bottom + 6, maxHeight }
    : { left, bottom: vh - cell.top + 6, maxHeight };
}

export function FindingsCell({ findings }: { findings: FindingPreview[] }) {
  const t = useTranslations("prReview");
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const cellRef = React.useRef<HTMLDivElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const close = React.useCallback(() => {
    clearTimers();
    setAnchor(null);
  }, [clearTimers]);

  React.useEffect(() => close, [close]);

  const openNow = React.useCallback(() => {
    const cell = cellRef.current?.getBoundingClientRect();
    if (cell) setAnchor(anchorFor(cell));
  }, []);

  // The popover is viewport-anchored, so list scrolling must not detach it
  // from its row: re-anchor on scroll. Scrolling INSIDE the popover is just
  // reading its list — ignored. The row leaving the viewport closes it.
  React.useEffect(() => {
    if (!anchor) return;
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      const cell = cellRef.current?.getBoundingClientRect();
      if (!cell || cell.bottom < 0 || cell.top > window.innerHeight) {
        close();
        return;
      }
      setAnchor(anchorFor(cell));
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [anchor, close]);

  if (findings.length === 0) return <span style={s.empty}>—</span>;

  const counts = countBySeverity(findings);
  const sorted = [...findings].sort(
    (a, b) => severityWeight(a.severity) - severityWeight(b.severity) || b.confidence - a.confidence,
  );

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = window.setTimeout(openNow, OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
  };

  return (
    <div
      ref={cellRef}
      role="group"
      style={s.cell}
      tabIndex={0}
      aria-label={t("list.findingsCell.cellAria", { count: findings.length })}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {SEVERITY_KEYS.filter((k) => counts[k] > 0).map((k) => (
        <SeverityBadge key={k} severity={k} count={counts[k]} compact />
      ))}
      {anchor && (
        <div
          ref={popRef}
          style={s.popover(anchor)}
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={s.popHeader}>
            <Icon.AlertOctagon size={12} />
            {t("list.findingsCell.popoverTitle", { count: findings.length })}
          </div>
          <div style={s.popList(anchor.maxHeight - HEADER_H)}>
            {sorted.map((f, i) => (
              <div key={f.id} style={s.popRow(i === sorted.length - 1)}>
                <div style={s.popRowTop}>
                  <SeverityBadge severity={f.severity} compact />
                  <span style={s.popTitle}>{f.title}</span>
                  <CategoryTag category={f.category} />
                </div>
                <div style={s.popMeta}>
                  <span className="mono" style={s.popFile}>
                    {f.file}:{f.start_line}
                    {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
                <div style={s.popBody}>{f.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
