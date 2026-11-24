import type React from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

export const POPOVER_WIDTH = 420;

export const s = {
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
  } satisfies React.CSSProperties,
  popover: (top: number, left: number): React.CSSProperties => ({
    position: "fixed",
    top,
    left,
    width: POPOVER_WIDTH,
    maxHeight: 380,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: "10px 14px",
    zIndex: 45,
    cursor: "default",
    animation: "ddpop .12s ease",
  }),
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    paddingBottom: 8,
  } satisfies React.CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies React.CSSProperties,
  item: (first: boolean, muted: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: "9px 0",
    borderTop: first ? "none" : "1px solid var(--border)",
    opacity: muted ? 0.55 : 1,
  }),
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies React.CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies React.CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10 } satisfies React.CSSProperties,
  rationale: {
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies React.CSSProperties,
  statusTag: { fontSize: 11, color: "var(--text-muted)" } satisfies React.CSSProperties,
};

/** One severity count in the run header: icon + number in the level's SEV
 *  colour, dotted underline to signal that it opens the findings list. */
export function triggerStyle(sev: Severity): React.CSSProperties {
  const c = SEV[sev].c;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 0 2px",
    background: "none",
    border: "none",
    borderBottom: `2px dotted ${c}`,
    borderRadius: 0,
    color: c,
    font: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}
