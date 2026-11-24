import type { CSSProperties } from "react";

/** Co-located styles for SkillPanel (tab bodies carry their own). */
export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 12px" } satisfies CSSProperties,
  name: { flex: 1, fontSize: 16, fontWeight: 700, wordBreak: "break-all" } satisfies CSSProperties,
  body: { padding: "20px" } satisfies CSSProperties,
} as const;
