import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView. */
export const s = {
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  main: { display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "20px 28px 12px" } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
} as const;
