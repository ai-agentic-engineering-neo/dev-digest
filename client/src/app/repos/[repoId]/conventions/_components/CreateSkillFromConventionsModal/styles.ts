import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  checkList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  agents: { display: "flex", flexWrap: "wrap", gap: "8px 20px" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { marginRight: "auto", fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
