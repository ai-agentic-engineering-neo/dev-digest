import type { CSSProperties } from "react";

export const s = {
  empty: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 20,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  emptyTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  emptyBody: { fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
