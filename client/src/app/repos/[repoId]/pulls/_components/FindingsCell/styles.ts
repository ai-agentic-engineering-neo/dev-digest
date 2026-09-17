import type { CSSProperties } from "react";

/** Co-located styles for FindingsCell (severity pills + hover popover). */
export const s = {
  empty: { color: "var(--text-muted)" } satisfies CSSProperties,
  cell: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    cursor: "help",
    outline: "none",
  } satisfies CSSProperties,
  /** Viewport-anchored (position: fixed) so the popover escapes the table
   *  card's overflow:hidden — on short tables an absolutely-positioned
   *  popover is clipped in BOTH directions. Placed below/above the cell
   *  depending on room, clamped to the viewport. The header stays pinned;
   *  only the list scrolls (its own maxHeight + contained overscroll so
   *  wheel-at-list-end doesn't chain to the page). */
  popover: (anchor: { left: number; top?: number; bottom?: number; maxHeight: number }): CSSProperties => ({
    position: "fixed",
    left: anchor.left,
    ...(anchor.top != null ? { top: anchor.top } : { bottom: anchor.bottom }),
    maxHeight: anchor.maxHeight,
    overflow: "hidden",
    zIndex: 30,
    width: 360,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    textAlign: "left",
    cursor: "default",
    animation: "ddpop .12s ease-out",
  }),
  popHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 9,
  } satisfies CSSProperties,
  popList: (maxHeight: number): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    maxHeight,
    overflowY: "auto",
    overscrollBehavior: "contain",
  }),
  popRow: (last: boolean): CSSProperties => ({
    padding: "9px 2px",
    borderBottom: last ? "none" : "1px solid var(--border)",
  }),
  popRowTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  popTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  popMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  popFile: { fontSize: 11, color: "var(--accent-text)" } satisfies CSSProperties,
  /** Two-line clamp — previews, not full rationale. */
  popBody: {
    fontSize: 11.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    marginTop: 4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
