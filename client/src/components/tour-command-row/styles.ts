import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  index: { width: 14, flexShrink: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  command: {
    display: "block",
    fontSize: 13.5,
    color: "var(--text-primary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  note: { marginTop: 2, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  copy: {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 4,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
  } satisfies CSSProperties,
};
