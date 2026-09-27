import type { CSSProperties } from "react";

export const s = {
  wrap: { marginBottom: 12 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
  } satisfies CSSProperties,
  square: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  label: { fontWeight: 700 } satisfies CSSProperties,
  description: { color: "var(--text-muted)", fontSize: 12, flex: 1 } satisfies CSSProperties,
  flagged: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "var(--crit)",
    fontSize: 12,
  } satisfies CSSProperties,
  dot: { width: 7, height: 7, borderRadius: "50%", background: "var(--crit)" } satisfies CSSProperties,
  count: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  body: { marginTop: 8 } satisfies CSSProperties,
} as const;
