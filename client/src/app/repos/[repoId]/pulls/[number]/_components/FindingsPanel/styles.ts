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
} as const;

/** Severity counter pill — outlined in the level's color, filled when active. */
export function sevChip(color: string, active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: 99,
    border: `1px solid ${color}`,
    background: active ? color : "transparent",
    color: active ? "var(--bg-surface)" : color,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "background .12s, color .12s",
  };
}

export const sevGroup = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties;
