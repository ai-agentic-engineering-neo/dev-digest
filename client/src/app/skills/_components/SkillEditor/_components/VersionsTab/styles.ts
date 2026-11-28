import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  vChip: (current: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 6,
    color: current ? "var(--accent)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
  }),
  meta: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 13.5, fontWeight: 500 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
