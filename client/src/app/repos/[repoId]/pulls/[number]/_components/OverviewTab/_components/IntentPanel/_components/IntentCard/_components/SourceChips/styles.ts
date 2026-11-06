import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  chip: (dimmed: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 12,
    background: "var(--bg-hover)",
    color: dimmed ? "var(--text-muted)" : "var(--text-secondary)",
    opacity: dimmed ? 0.6 : 1,
  }),
  link: { color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
} as const;
