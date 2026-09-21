import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  card: {
    padding: "20px 24px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
