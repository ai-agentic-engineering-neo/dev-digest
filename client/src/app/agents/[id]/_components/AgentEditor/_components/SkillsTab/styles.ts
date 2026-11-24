import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 220,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;
