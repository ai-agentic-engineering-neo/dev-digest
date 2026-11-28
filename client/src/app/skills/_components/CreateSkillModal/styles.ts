import type { CSSProperties } from "react";

/** Styles for the create-skill modal. */
export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 14 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
