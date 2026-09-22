import type { CSSProperties } from "react";

/** Co-located styles for SkillMetaFields. */
export const s = {
  error: { color: "var(--crit)" } satisfies CSSProperties,
  suffix: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
