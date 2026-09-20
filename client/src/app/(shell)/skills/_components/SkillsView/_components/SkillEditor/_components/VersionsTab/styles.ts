import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
