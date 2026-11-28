import type { CSSProperties } from "react";

/** Styles for the Versions tab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--border-strong)" : "var(--border)"),
    background: "var(--bg-elevated)",
  }),
  chip: (current: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 5,
    color: current ? "var(--accent-text)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
  }),
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 14, fontWeight: 500 } satisfies CSSProperties,
  noNote: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
} as const;
