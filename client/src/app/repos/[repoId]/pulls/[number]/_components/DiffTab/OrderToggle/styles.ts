import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  option: (active: boolean): CSSProperties => ({
    padding: "3px 10px",
    border: "none",
    font: "inherit",
    fontSize: 12,
    cursor: "pointer",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
  }),
} as const;
