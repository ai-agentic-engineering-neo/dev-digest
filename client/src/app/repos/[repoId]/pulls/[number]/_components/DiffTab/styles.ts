import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  headerActions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  unavailable: {
    padding: "10px 14px",
    marginBottom: 10,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
