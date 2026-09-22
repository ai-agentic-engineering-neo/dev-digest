"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { SeverityBadge } from "@devdigest/ui";
import {
  FindingPreviewPanel,
  PREVIEW_PANEL_MAX_HEIGHT,
  PREVIEW_PANEL_WIDTH,
} from "@/components/finding-preview";
import { SEVERITIES } from "@/lib/severity";
import type { PrFindings } from "@devdigest/shared";

/** Padding on the wrapper, not an offset: a gap the pointer crosses would
 *  close the panel before it arrived. */
const GAP = 6;

type Placement = { left: number; top: number } | { left: number; bottom: number };

export function FindingsCell({ findings }: { findings?: PrFindings | null }) {
  const t = useTranslations("prReview");
  const anchor = React.useRef<HTMLDivElement>(null);
  const [overIcons, setOverIcons] = React.useState(false);
  const [overPanel, setOverPanel] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const open = overIcons || overPanel || focused;

  /* The table card clips its children, so the panel cannot live inside it. */
  React.useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const roomBelow = window.innerHeight - r.bottom;
      const flip = roomBelow < PREVIEW_PANEL_MAX_HEIGHT + GAP && r.top > roomBelow;
      const left = Math.max(
        GAP,
        Math.min(r.left, window.innerWidth - PREVIEW_PANEL_WIDTH - GAP),
      );
      setPlacement(
        flip ? { left, bottom: window.innerHeight - r.top } : { left, top: r.bottom },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  if (!findings || findings.total === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const present = SEVERITIES.filter((l) => (findings.counts[l] ?? 0) > 0);
  const heading = t("list.findingsInRun", { count: findings.total });
  const flipped = placement !== null && "bottom" in placement;

  return (
    <div
      ref={anchor}
      data-testid="findings-cell"
      tabIndex={0}
      aria-label={heading}
      onMouseEnter={() => setOverIcons(true)}
      onMouseLeave={() => setOverIcons(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        setOverIcons(false);
        setOverPanel(false);
        setFocused(false);
      }}
      onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", gap: 6, cursor: "help" }}
    >
      {present.map((l) => (
        <SeverityBadge key={l} severity={l} count={findings.counts[l]} compact />
      ))}

      {open &&
        placement !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-testid="findings-preview-portal"
            onMouseEnter={() => setOverPanel(true)}
            onMouseLeave={() => setOverPanel(false)}
            style={{
              position: "fixed",
              zIndex: 30,
              ...placement,
              [flipped ? "paddingBottom" : "paddingTop"]: GAP,
            }}
          >
            <FindingPreviewPanel heading={heading} items={findings.previews} />
          </div>,
          document.body,
        )}
    </div>
  );
}
