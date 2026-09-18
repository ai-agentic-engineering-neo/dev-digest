import type { CSSProperties } from "react";

/** Co-located styles for FindingsPreviewCard. */
export const CARD_WIDTH = 400;

export const s = {
  card: (top: number, left: number): CSSProperties => ({
    // FIXED, not absolute: the PR-list container clips overflowing children,
    // so an absolutely-positioned card would be cut off mid-row.
    position: "fixed",
    top,
    left,
    zIndex: 60,
    width: CARD_WIDTH,
    maxHeight: 360,
    overflowY: "auto",
    padding: 12,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated, var(--bg-surface))",
    boxShadow: "0 12px 32px rgba(0,0,0,.35)",
    cursor: "default",
  }),
  title: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
    marginTop: 10,
  } satisfies CSSProperties,
  firstItem: { paddingTop: 0, borderTop: "none", marginTop: 0 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 11.5,
  } satisfies CSSProperties,
  conf: { color: "var(--text-muted)" } satisfies CSSProperties,
  rationale: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
