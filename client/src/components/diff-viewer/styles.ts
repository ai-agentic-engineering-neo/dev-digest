import type { CSSProperties } from "react";
import type { Line } from "./helpers";

/** Co-located styles for the DiffViewer (extracted from inline styles). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  fileStat: { fontSize: 12 } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  fileBody: {
    borderTop: "1px solid var(--border)",
    padding: "8px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
  hunk: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,
  lineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
  findingDot: (color: string): CSSProperties => ({
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: 99,
    background: color,
    marginLeft: 6,
    flexShrink: 0,
  }),
  findingCardsWrap: {
    margin: "6px 14px 8px 58px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  unanchoredWrap: {
    borderTop: "1px solid var(--border)",
    margin: "4px 14px 4px 14px",
    paddingTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  unanchoredTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the file card is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

/** Row background per line kind (add/del tinted, others transparent), plus an
    optional 3px left stripe (highest-severity finding color) on this line.
    `muted` (all findings dismissed) fades the stripe's color, not the row —
    the code text must stay fully readable. */
export function lineRowFor(kind: Line["kind"], stripeColor?: string, muted = false): CSSProperties {
  const background = kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent";
  const stripe = stripeColor && muted ? `color-mix(in srgb, ${stripeColor} 40%, transparent)` : stripeColor;
  return {
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
    background,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: stripe ?? "transparent",
  };
}

/** The clickable severity badge on a code line (`FindingMarker`): icon + word
    in a pill with the severity's border and tinted background (`SEV` tokens). */
export function findingMarkerStyle(color: string, muted: boolean, bg = "transparent"): CSSProperties {
  return {
    marginLeft: "auto",
    marginRight: 10,
    alignSelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "0 8px",
    lineHeight: "18px",
    borderRadius: 6,
    border: `1px solid ${color}`,
    background: bg,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color,
    flexShrink: 0,
    opacity: muted ? 0.5 : 1,
  };
}

/** Gutter sign colour per line kind. */
export function lineSignFor(kind: Line["kind"]): CSSProperties {
  return {
    width: 14,
    textAlign: "center",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    flexShrink: 0,
  };
}
