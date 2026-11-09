import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 10 } as const satisfies CSSProperties;
const list = {
  margin: 0,
  padding: "0 0 0 20px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const satisfies CSSProperties;
const item = { fontSize: 13, overflowWrap: "anywhere" } as const satisfies CSSProperties;
const empty = { margin: 0, fontSize: 13, color: "var(--text-muted)" } as const satisfies CSSProperties;

export const s = { root, list, item, empty };
