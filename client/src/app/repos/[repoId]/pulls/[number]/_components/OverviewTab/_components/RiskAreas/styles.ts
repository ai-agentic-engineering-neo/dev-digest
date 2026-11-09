import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 10 } as const satisfies CSSProperties;
const heading = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--text-muted)",
} as const satisfies CSSProperties;
const list = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const satisfies CSSProperties;
const item = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
} as const satisfies CSSProperties;
const head = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as const satisfies CSSProperties;
const kindIcon = { color: "var(--text-muted)", flexShrink: 0 } as const satisfies CSSProperties;
const title = { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" } as const satisfies CSSProperties;
const severity = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
} as const satisfies CSSProperties;
const explanation = {
  margin: 0,
  fontSize: 13,
  color: "var(--text-secondary)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;
const refs = { display: "flex", flexWrap: "wrap", gap: 8 } as const satisfies CSSProperties;
const empty = { margin: 0, fontSize: 13, color: "var(--text-muted)" } as const satisfies CSSProperties;

export const s = { root, heading, list, item, head, kindIcon, title, severity, explanation, refs, empty };
