import type { CSSProperties } from "react";
export { s as cardStyles } from "../AgentsCard/styles";

export const s = {
  body: { display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" } satisfies CSSProperties,
  legend: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 140 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  swatch: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 } satisfies CSSProperties,
  cat: { color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  count: { fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
} as const;
