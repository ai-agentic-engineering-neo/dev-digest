import type { CSSProperties } from "react";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  counterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  counterSep: { color: "var(--text-muted)" } satisfies CSSProperties,
  counterBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    border: "1px solid transparent",
    background: "transparent",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "opacity .12s",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
