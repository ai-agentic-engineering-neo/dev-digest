import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillPicker. */
export const s = {
  wrap: { maxWidth: 560, padding: 28, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
