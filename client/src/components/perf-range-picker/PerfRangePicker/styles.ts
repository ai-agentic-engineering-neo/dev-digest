import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" } satisfies CSSProperties,
  row: { display: "flex", gap: 6, alignItems: "center" } satisfies CSSProperties,
  btn: (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    cursor: "pointer",
  }),
  customRow: { display: "flex", gap: 8, alignItems: "flex-end" } satisfies CSSProperties,
  customLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  dateInput: {
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text)",
    fontSize: 13,
  } satisfies CSSProperties,
  applyBtn: {
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
