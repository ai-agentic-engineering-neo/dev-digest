import type { CSSProperties } from "react";

export const s = {
  tile: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 18px",
    minHeight: 88,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 32 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  value: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" } satisfies CSSProperties,
  unit: { fontSize: 15, fontWeight: 500, color: "var(--text-muted)", marginLeft: 4 } satisfies CSSProperties,
} as const;
