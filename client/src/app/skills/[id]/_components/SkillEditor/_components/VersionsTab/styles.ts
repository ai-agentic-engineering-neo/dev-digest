import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  meta: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  version: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  diff: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
