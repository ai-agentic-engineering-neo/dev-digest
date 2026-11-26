import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  usage: { color: "var(--text-primary)", fontWeight: 600, margin: "0 0 8px" } satisfies CSSProperties,
  note: { margin: 0 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
