import type { CSSProperties } from "react";

/** Co-located styles for SkillControls. */
export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  /** Visually hidden, still read by screen readers (names the switch). */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
