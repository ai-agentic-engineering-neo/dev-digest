import type { CSSProperties } from "react";

/** Styles for the version diff modal. */
export const s = {
  body: { padding: "18px 24px 24px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  fieldRow: { display: "flex", gap: 12, fontSize: 13, alignItems: "baseline" } satisfies CSSProperties,
  fieldLabel: { width: 100, flexShrink: 0, color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
  from: { color: "var(--code-del-text)", textDecoration: "line-through" } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)" } satisfies CSSProperties,
  to: { color: "var(--code-add-text)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
