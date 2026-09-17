import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounts. */
export const s = {
  group: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  chip: { display: "inline-flex" } satisfies CSSProperties,
  button: {
    display: "inline-flex",
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 6,
    background: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
  buttonActive: {
    borderColor: "var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  buttonMuted: { opacity: 0.45 } satisfies CSSProperties,
} as const;
