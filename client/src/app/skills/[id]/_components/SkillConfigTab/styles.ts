import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 650, flex: 1 } satisfies CSSProperties,
  bodyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileName: { fontSize: 12, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  charCount: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", flex: 1 } satisfies CSSProperties,
} as const;
