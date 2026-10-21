import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "var(--bg-elevated)",
    borderRadius: 8,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, fontSize: 14, overflowWrap: "anywhere" } satisfies CSSProperties,
  path: { color: "var(--text-primary)", fontSize: 13.5 } satisfies CSSProperties,
  why: { color: "var(--text-secondary)" } satisfies CSSProperties,
  open: {
    flexShrink: 0,
    padding: "5px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    cursor: "pointer",
  } satisfies CSSProperties,
};
