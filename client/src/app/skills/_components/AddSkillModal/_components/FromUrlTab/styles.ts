import type { CSSProperties } from "react";

/** Co-located styles for FromUrlTab. */
export const s = {
  error: {
    marginTop: 8,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
