import type { CSSProperties } from "react";

const POPOVER_WIDTH = 420;

export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  count: (c: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color: c,
    fontSize: 12.5,
    fontWeight: 600,
    // A border, not text-decoration: underline skips the inline SVG icon.
    borderBottom: `1px dotted ${c}`,
    paddingBottom: 1,
    cursor: "default",
  }),
  // Transparent top padding bridges the gap so moving the mouse onto the panel
  // doesn't fire mouseleave. Clamped so it never overflows the right edge.
  popover: (r: DOMRect): CSSProperties => ({
    position: "fixed",
    top: r.bottom,
    left: Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8)),
    width: POPOVER_WIDTH,
    paddingTop: 6,
    zIndex: 1000,
    cursor: "default",
  }),
  panel: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    padding: "10px 12px",
    maxHeight: 360,
    overflowY: "auto",
  } satisfies CSSProperties,
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  loading: { fontSize: 12, color: "var(--text-muted)", padding: "4px 0" } satisfies CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemTitleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  itemTitle: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  itemMeta: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  file: { fontSize: 11.5, color: "var(--accent-text)" } satisfies CSSProperties,
  rationale: {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
