import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 8, color: "var(--warn)" } satisfies CSSProperties,
  text: { margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
