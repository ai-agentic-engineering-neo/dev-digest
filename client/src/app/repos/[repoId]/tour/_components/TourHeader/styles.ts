import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 30, fontWeight: 650, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  name: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  stale: { marginLeft: 8, color: "var(--warn)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
