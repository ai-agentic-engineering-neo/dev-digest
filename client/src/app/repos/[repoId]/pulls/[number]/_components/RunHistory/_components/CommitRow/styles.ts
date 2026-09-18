import type { CSSProperties } from "react";

export const s = {
  // Commits are markers, not actions — lighter (dashed, transparent) so they
  // read as separators between the runs they sit chronologically between.
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
  } satisfies CSSProperties,
  icon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  sha: {
    fontSize: 12,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  message: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  author: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  time: {
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
};
