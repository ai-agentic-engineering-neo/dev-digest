import type { CSSProperties } from "react";

/** Co-located styles for DiffTab — CSS variables only. */
export const s = {
  note: {
    margin: "0 0 12px",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
} as const;
