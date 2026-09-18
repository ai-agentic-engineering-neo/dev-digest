import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  warning: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  markdown: {
    maxHeight: 240,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
  } satisfies CSSProperties,
} as const;
