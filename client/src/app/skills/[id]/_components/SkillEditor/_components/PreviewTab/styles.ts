import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  tokens: { marginLeft: "auto" } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: 16,
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
  } satisfies CSSProperties,
} as const;
