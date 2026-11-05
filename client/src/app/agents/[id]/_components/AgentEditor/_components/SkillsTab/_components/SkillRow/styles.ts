import type { CSSProperties } from "react";

/** Co-located styles for one row of the agent's Skills tab. */
export const s = {
  row: (linked: boolean, dragOver: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (dragOver ? "var(--accent)" : "var(--border)"),
    background: linked ? "var(--bg-elevated)" : "var(--bg-surface)",
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
  name: (linked: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: linked ? 600 : 500,
    color: linked ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  muted: { opacity: 0.55 } satisfies CSSProperties,
  arrows: { display: "flex", gap: 2 } satisfies CSSProperties,
  arrowBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  /** "#1" column — fixed width so type badges line up whether linked or not. */
  position: { width: 26, textAlign: "right", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
