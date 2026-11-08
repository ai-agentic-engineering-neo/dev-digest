import type { CSSProperties } from "react";

/** Co-located styles for one row of the agent's Context tab. */
export const s = {
  row: (attached: boolean, dragOver: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (dragOver ? "var(--accent)" : "var(--border)"),
    background: attached ? "var(--bg-elevated)" : "var(--bg-surface)",
  }),
  handle: (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    width: 14,
    flexShrink: 0,
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
  }),
  toggle: { display: "inline-flex", flexShrink: 0 } satisfies CSSProperties,
  nameBlock: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  path: (attached: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: attached ? 600 : 500,
    color: attached ? "var(--text-primary)" : "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  arrows: { display: "flex", gap: 2 } satisfies CSSProperties,
  iconBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  textBtn: {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 5,
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  position: { width: 30, textAlign: "right", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
