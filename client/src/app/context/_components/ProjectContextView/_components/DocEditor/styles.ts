import type { CSSProperties } from "react";

/** Co-located styles for DocEditor. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: { display: "block" } satisfies CSSProperties,
  /** Text for assistive technology only: the design-system Textarea has no label prop. */
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  counter: (over: boolean): CSSProperties => ({
    fontSize: 12,
    color: over ? "var(--crit)" : "var(--text-muted)",
  }),
  save: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
