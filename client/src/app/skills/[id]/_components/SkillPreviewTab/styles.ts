import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 650 } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  card: {
    padding: 24,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
