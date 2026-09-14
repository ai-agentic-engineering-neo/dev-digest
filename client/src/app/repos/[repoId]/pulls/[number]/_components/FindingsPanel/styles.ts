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
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  severityBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  severityButton: (active: boolean, dimmed: boolean): CSSProperties => ({
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    borderRadius: 5,
    outline: active ? "2px solid var(--accent)" : "none",
    outlineOffset: 2,
    opacity: dimmed ? 0.45 : 1,
    transition: "opacity 0.12s ease",
  }),
} as const;
