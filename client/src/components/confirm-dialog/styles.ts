import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  body: { display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 24px" } satisfies CSSProperties,
  icon: { flexShrink: 0, color: "var(--crit)", marginTop: 1 } satisfies CSSProperties,
  text: { fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
