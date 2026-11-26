import type { CSSProperties } from "react";

/** Co-located styles for VersionRow (one bordered card per version). */
export const s = {
  row: {
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
};
