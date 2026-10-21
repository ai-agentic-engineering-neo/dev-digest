import type { CSSProperties } from "react";

/** Co-located styles for DocPane. */
export const s = {
  pane: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  center: { flex: 1, display: "grid", placeItems: "center", padding: 24 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 24px",
    borderBottom: "1px solid var(--border)",
    minHeight: 56,
  } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  modePills: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  usage: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  usedBy: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  coverage: { display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 } satisfies CSSProperties,
  coverageLabel: { fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: "20px 32px 32px" } satisfies CSSProperties,
  markdown: { maxWidth: 860, fontSize: 14, lineHeight: 1.6 } satisfies CSSProperties,
  resetRow: { display: "flex", marginBottom: 12 } satisfies CSSProperties,
  notice: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
