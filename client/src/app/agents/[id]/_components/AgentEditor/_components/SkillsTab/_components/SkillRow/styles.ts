import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  row: ({
    attached,
    dragging,
    dimmed,
    flagged = false,
  }: {
    attached: boolean;
    dragging: boolean;
    dimmed: boolean;
    flagged?: boolean;
  }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    // A flagged skill (possible prompt injection) is framed in red.
    border: flagged ? "1px solid var(--crit)" : "1px solid var(--border)",
    boxShadow: flagged ? "0 0 0 1px var(--crit)" : "none",
    background: flagged ? "var(--crit-bg)" : attached ? "var(--bg-elevated)" : "var(--bg-surface)",
    opacity: dragging ? 0.4 : dimmed ? 0.7 : 1,
    cursor: flagged && !attached ? "not-allowed" : undefined,
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
