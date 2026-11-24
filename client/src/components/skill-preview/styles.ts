import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  text: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  body: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13.5,
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
