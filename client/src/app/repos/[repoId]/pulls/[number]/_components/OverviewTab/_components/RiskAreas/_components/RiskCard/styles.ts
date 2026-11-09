import type { CSSProperties } from "react";

const item = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
  cursor: "pointer",
} as const satisfies CSSProperties;
const head = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 } as const satisfies CSSProperties;
const kindIcon = { flexShrink: 0 } as const satisfies CSSProperties;
const title = { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere", minWidth: 0 } as const satisfies CSSProperties;
const severity = { fontSize: 12, fontWeight: 600 } as const satisfies CSSProperties;
const more = { fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;
const spacer = { flex: 1 } as const satisfies CSSProperties;
const toggle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 2,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  borderRadius: 4,
} as const satisfies CSSProperties;
const chevron = { transition: "transform 120ms" } as const satisfies CSSProperties;
const chevronOpen = { transform: "rotate(180deg)" } as const satisfies CSSProperties;
const details = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } as const satisfies CSSProperties;
const explanation = {
  margin: 0,
  fontSize: 13,
  color: "var(--text-secondary)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;
const refs = { display: "flex", flexWrap: "wrap", gap: 8 } as const satisfies CSSProperties;

export const s = {
  item,
  head,
  kindIcon,
  title,
  severity,
  more,
  spacer,
  toggle,
  chevron,
  chevronOpen,
  details,
  explanation,
  refs,
};
