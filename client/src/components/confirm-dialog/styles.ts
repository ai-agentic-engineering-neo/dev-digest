import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
