import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px" } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
} as const;
