import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  row: (checked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${checked ? "var(--border-strong)" : "var(--border)"}`,
    background: checked ? "var(--bg-elevated)" : "var(--bg-surface)",
    listStyle: "none",
  }),
  dragging: { position: "relative", zIndex: 2, boxShadow: "var(--shadow-modal)" } satisfies CSSProperties,
  handleSlot: { width: 22, display: "inline-flex", justifyContent: "center", flexShrink: 0 } satisfies CSSProperties,
  handle: (disabled: boolean): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    width: 22,
    height: 22,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "grab",
    opacity: disabled ? 0.4 : 1,
    touchAction: "none",
  }),
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  disabled: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  description: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
} as const;
