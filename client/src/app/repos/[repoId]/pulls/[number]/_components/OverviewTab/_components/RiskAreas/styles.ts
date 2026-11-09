import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 10 } as const satisfies CSSProperties;
const list = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const satisfies CSSProperties;
const empty = { margin: 0, fontSize: 13, color: "var(--text-muted)" } as const satisfies CSSProperties;

export const s = { root, list, empty };
