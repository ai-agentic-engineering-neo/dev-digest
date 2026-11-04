import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounters — CSS variables only, no hard-coded colors. */
export const s = {
  group: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  button: ({
    pressed,
    dimmed,
    empty,
  }: {
    pressed: boolean;
    dimmed: boolean;
    empty: boolean;
  }): CSSProperties => ({
    display: "inline-flex",
    padding: 2,
    borderRadius: 7,
    border: "1px solid " + (pressed ? "var(--accent)" : "transparent"),
    background: pressed ? "var(--accent-bg)" : "transparent",
    cursor: empty ? "default" : "pointer",
    opacity: empty ? 0.4 : dimmed ? 0.55 : 1,
    transition: "opacity .12s, border-color .12s",
  }),
} as const;
