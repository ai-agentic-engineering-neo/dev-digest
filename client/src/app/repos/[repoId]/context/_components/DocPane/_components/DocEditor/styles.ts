import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 360,
    resize: "vertical",
    boxSizing: "border-box",
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  bar: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  unsaved: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
