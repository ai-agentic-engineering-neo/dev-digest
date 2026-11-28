import type { CSSProperties } from "react";

/** Styles for the create-skill-from-conventions modal. */
export const s = {
  body: { padding: "20px 24px 4px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: "var(--gap)" } satisfies CSSProperties,
} as const;
