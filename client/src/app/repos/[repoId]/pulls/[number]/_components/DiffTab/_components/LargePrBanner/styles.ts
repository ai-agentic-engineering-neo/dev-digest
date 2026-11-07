import type { CSSProperties } from "react";

/** Co-located styles for LargePrBanner — CSS variables only. */
export const s = {
  root: {
    padding: "10px 14px",
    margin: "0 0 12px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  body: {
    marginTop: 4,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
