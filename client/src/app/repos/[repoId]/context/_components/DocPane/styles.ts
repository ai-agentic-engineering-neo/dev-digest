import type { CSSProperties } from "react";

export const s = {
  pane: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  header: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: {
    fontFamily: "var(--font-mono)",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  switch: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  body: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: "16px 20px",
    minWidth: 0,
  } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
