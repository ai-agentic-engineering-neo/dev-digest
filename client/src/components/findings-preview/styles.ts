import type { CSSProperties } from "react";
import { CARD_MAX_HEIGHT, CARD_WIDTH } from "./helpers";

/** Co-located styles for FindingsPreviewCard. */
export const s = {
  // `fixed`, not `absolute`: both hosts (the PR list table and the run
  // timeline) sit inside containers with `overflow: hidden`, which clips an
  // absolutely positioned child. Coordinates come from the anchor's
  // getBoundingClientRect(), clamped by anchorFor().
  card: (top: number, left: number): CSSProperties => ({
    position: "fixed",
    top,
    left,
    zIndex: 60,
    width: CARD_WIDTH,
    maxHeight: CARD_MAX_HEIGHT,
    overflowY: "auto",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,.45)",
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
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    fontSize: 12,
  } satisfies CSSProperties,
  file: { fontSize: 12, color: "var(--accent-text)" } satisfies CSSProperties,
  rationale: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  more: {
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  loading: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
