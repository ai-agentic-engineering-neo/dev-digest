import type { CSSProperties } from "react";

/** Co-located styles for DroppedCandidates. */
export const s = {
  wrap: { marginTop: 18 } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "baseline",
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  rule: { color: "var(--text-secondary)" } satisfies CSSProperties,
  path: { color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  reason: { color: "var(--warn)", fontSize: 12, whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
