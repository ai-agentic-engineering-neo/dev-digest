import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: "0 0 8px", padding: "0 12px 0 30px" } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" } satisfies CSSProperties,
  pos: { color: "var(--text-muted)", width: 18 } satisfies CSSProperties,
  name: { fontWeight: 600 } satisfies CSSProperties,
  version: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
