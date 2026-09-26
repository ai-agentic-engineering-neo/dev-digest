import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 780 } satisfies CSSProperties,
  heading: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  panel: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    padding: 20,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
