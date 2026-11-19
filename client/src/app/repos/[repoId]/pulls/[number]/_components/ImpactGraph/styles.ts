import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "grid", gap: 10 } satisfies CSSProperties,
  filters: { display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  filterLabel: { display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" } satisfies CSSProperties,
  body: { display: "grid", gap: 10 } satisfies CSSProperties,
  detail: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } satisfies CSSProperties,
  detailTitle: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  dl: { display: "grid", gridTemplateColumns: "max-content 1fr", gap: "2px 12px", margin: 0 } satisfies CSSProperties,
  dd: { margin: 0, wordBreak: "break-all" } satisfies CSSProperties,
  empty: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: 18,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
