import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: 12,
  } satisfies CSSProperties,
  body: {
    fontSize: 14,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
