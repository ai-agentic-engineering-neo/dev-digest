import type { CSSProperties } from "react";

const root = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
} as const satisfies CSSProperties;
const box = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 14,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--bg-elevated)",
} as const satisfies CSSProperties;
const verdictError = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 10px",
  border: "1px solid var(--crit)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--crit)",
} as const satisfies CSSProperties;

export const s = { root, box, verdictError };
