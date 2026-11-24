import type { CSSProperties } from "react";

export const s = {
  row: (linked: boolean, over: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + (over ? "var(--accent)" : "var(--border)"),
    background: linked ? "var(--bg-elevated)" : "var(--bg-surface)",
  }),
  handle: (draggable: boolean): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    width: 18,
    color: "var(--text-muted)",
    cursor: draggable ? "grab" : "default",
    visibility: draggable ? "visible" : "hidden",
  }),
  name: { fontSize: 13.5, fontWeight: 600 } satisfies CSSProperties,
  grow: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  arrows: { display: "inline-flex", gap: 2 } satisfies CSSProperties,
} as const;
