import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 } as const satisfies CSSProperties;
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } as const satisfies CSSProperties;
const model = { fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;
const actions = { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } as const satisfies CSSProperties;
const hint = { margin: 0, fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;
const status = { fontSize: 12, color: "var(--info)" } as const satisfies CSSProperties;
const outdated = { margin: 0, fontSize: 12, fontWeight: 600, color: "var(--warn)" } as const satisfies CSSProperties;
const label = { margin: 0, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-muted)" } as const satisfies CSSProperties;
const summary = { margin: 0, fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--text-secondary)" } as const satisfies CSSProperties;
const empty = { margin: 0, fontSize: 13, color: "var(--text-muted)" } as const satisfies CSSProperties;
const emptyHint = { margin: 0, fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;
const error = {
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
const link = { color: "var(--info)", textDecoration: "underline" } as const satisfies CSSProperties;

export const s = { root, header, model, actions, hint, status, outdated, label, summary, empty, emptyHint, error, link };
