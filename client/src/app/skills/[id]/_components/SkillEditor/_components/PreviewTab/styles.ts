import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  card: {
    padding: "18px 20px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
