/* FindingsPopover — portal-rendered hover popover listing every finding
   counted by the trigger, read-only. Rendered into document.body (via
   position: fixed) because the PR-list table card clips overflow, and the
   Timeline row would clip too. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@devdigest/ui";
import { FindingPreviewRow } from "./FindingPreviewRow";
import type { FindingPreviewLike } from "./helpers";

const WIDTH = 340;
const MAX_HEIGHT = 360;
const GAP = 8;
const MARGIN = 8;

function computeStyle(anchor: HTMLElement): React.CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < MAX_HEIGHT + GAP && rect.top > spaceBelow;
  const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - WIDTH - MARGIN);
  return openUp
    ? { left, bottom: window.innerHeight - rect.top + GAP }
    : { left, top: rect.bottom + GAP };
}

export function FindingsPopover({
  anchor,
  title,
  items,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor: HTMLElement;
  title: string;
  items: FindingPreviewLike[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [style, setStyle] = React.useState<React.CSSProperties>(() => computeStyle(anchor));

  React.useLayoutEffect(() => {
    const reposition = () => setStyle(computeStyle(anchor));
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [anchor]);

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        ...style,
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
        overflowY: "auto",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: 9,
        boxShadow: "var(--shadow-modal)",
        zIndex: 40,
        animation: "ddpop .12s ease",
        padding: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Icon.Info size={12} />
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((f) => (
          <FindingPreviewRow key={f.id} finding={f} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
