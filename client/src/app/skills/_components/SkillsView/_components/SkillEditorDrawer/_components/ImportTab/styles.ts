import type { CSSProperties } from "react";

export const s = {
  pick: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  input: { display: "none" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 } satisfies CSSProperties,
} as const;
