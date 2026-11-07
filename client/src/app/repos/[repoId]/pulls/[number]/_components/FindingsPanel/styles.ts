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
  list: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "4px 0",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-muted)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  groupRule: { flex: 1, height: 1, background: "var(--border)" } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? "none" : "rotate(-90deg)",
    transition: "transform .15s",
    flexShrink: 0,
  }),
} as const;
