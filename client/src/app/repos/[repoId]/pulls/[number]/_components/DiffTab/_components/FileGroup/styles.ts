import type { CSSProperties } from "react";

/** Co-located styles for FileGroup. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  } satisfies CSSProperties,
  roleSquare: (color: string): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 3,
    background: color,
    flexShrink: 0,
  }),
  roleLabel: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  roleDesc: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  chips: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  fileCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
