import type { CSSProperties } from "react";

/** Co-located styles for the CiTab tree. */
export const s = {
  wrap: { maxWidth: 900, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  headSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  gateRow: { display: "flex", gap: 8 } satisfies CSSProperties,
  gateOption: (active: boolean): CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-subtle, var(--bg-elevated))" : "var(--bg-elevated)",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
  }),
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  rowMeta: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
} as const;
