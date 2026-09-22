import type { CSSProperties } from "react";

/** Co-located styles for DeleteSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 12, fontSize: 14 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  warn: { color: "var(--warn)", fontWeight: 600 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
