/* FindingsSummary — compact severity icons (only the severities actually
   present); hovering shows a read-only popover ("N FINDINGS IN THIS RUN")
   previewing each finding — no accept/reject here, that lives on the
   PR-detail Review-runs accordion (FindingCard). Used both in the PR-list
   FINDINGS column and the PR-detail Agent-runs Timeline.
   The popover renders through a portal to <body> at a `position: fixed`
   spot computed from the trigger's bounding rect, so it isn't clipped by an
   ancestor with `overflow: hidden` (e.g. the PR-list table card) — a plain
   absolutely-positioned popover would get cut off whenever the hovered row
   sits near the bottom of its scroll/clip container. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity as UiSeverity, type Category } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { severityCounts, FILTERABLE_SEVERITIES, lineLabel } from "@/lib/findings";
import { sortedFindings, shortDescription } from "./helpers";
import { s } from "./styles";

const POPOVER_WIDTH = 340;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 12;

function FindingPreviewCard({ f }: { f: Finding }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <SeverityBadge severity={f.severity as UiSeverity} compact />
        <span style={s.cardTitle}>{f.title}</span>
      </div>
      <div style={s.cardMeta}>
        <CategoryTag category={f.category as Category} />
        <span className="mono">
          {f.file}:{lineLabel(f)}
        </span>
        <ConfidenceNum value={f.confidence} />
      </div>
      <p style={s.cardDescription}>{shortDescription(f.rationale)}</p>
    </div>
  );
}

export function FindingsSummary({ findings }: { findings: Finding[] }) {
  const t = useTranslations("prReview");
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [hoverTrigger, setHoverTrigger] = React.useState(false);
  const [hoverPopover, setHoverPopover] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  const open = (hoverTrigger || hoverPopover) && coords != null;

  // A `position: fixed` popover goes stale on scroll/resize of an ANCESTOR
  // (it doesn't move with the trigger) — close it rather than leave it
  // floating over the wrong spot. Capture phase: the scrolling ancestor is
  // the page's <main>, not window, and scroll events don't bubble. Scrolling
  // the popover's own (long) findings list also fires a capture-phase
  // "scroll" here, so it must be excluded or the popover would close the
  // instant you tried to scroll it.
  React.useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      setHoverTrigger(false);
      setHoverPopover(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (findings.length === 0) return <span style={s.muted}>—</span>;

  const counts = severityCounts(findings);
  const present = FILTERABLE_SEVERITIES.filter((sev) => counts[sev] > 0);
  const ordered = sortedFindings(findings);

  return (
    <div
      ref={triggerRef}
      style={s.trigger}
      onMouseEnter={() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
          setCoords({
            top: rect.bottom + POPOVER_GAP,
            left: Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
          });
        }
        setHoverTrigger(true);
      }}
      onMouseLeave={() => setHoverTrigger(false)}
    >
      {present.map((sev) => (
        <SeverityBadge key={sev} severity={sev as UiSeverity} count={counts[sev]} compact />
      ))}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ ...s.popover, position: "fixed", top: coords.top, left: coords.left }}
            onMouseEnter={() => setHoverPopover(true)}
            onMouseLeave={() => setHoverPopover(false)}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={s.popoverTitle}>{t("list.findingsPopover.title", { count: findings.length })}</div>
            <div style={s.list}>
              {ordered.map((f) => (
                <FindingPreviewCard key={f.id} f={f} />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default FindingsSummary;
