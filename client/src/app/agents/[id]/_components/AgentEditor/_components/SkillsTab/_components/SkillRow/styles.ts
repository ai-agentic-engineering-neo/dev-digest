import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  row: ({ attached, dragging, dimmed }: { attached: boolean; dragging: boolean; dimmed: boolean }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: attached ? "var(--bg-elevated)" : "var(--bg-surface)",
    opacity: dragging ? 0.4 : dimmed ? 0.7 : 1,
  }),
  handle: (canMove: boolean, attached: boolean): CSSProperties => ({
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: canMove ? "grab" : "not-allowed",
    opacity: canMove ? 1 : 0.4,
    // unattached rows keep the slot so names stay aligned
    visibility: attached ? "visible" : "hidden",
  }),
  name: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  badges: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
} as const;
