import type { CSSProperties } from "react";

export const s = {
  drop: (over: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "28px 16px",
    borderRadius: 10,
    border: `1.5px dashed ${over ? "var(--accent)" : "var(--border-strong)"}`,
    background: over ? "var(--bg-hover)" : "var(--bg-surface)",
    textAlign: "center",
  }),
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { margin: 0, fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
