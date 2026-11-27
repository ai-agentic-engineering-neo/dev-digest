import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (mirrors AgentCard). */
export const s = {
  // A flagged skill keeps full opacity (it must stand out) and gets a red frame.
  card: (enabled: boolean, flagged = false): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: flagged ? "1px solid var(--crit)" : "1px solid var(--border)",
    boxShadow: flagged ? "0 0 0 1px var(--crit)" : "none",
    background: "var(--bg-elevated)",
    opacity: enabled || flagged ? 1 : 0.6,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  deleteBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "10px 0 8px" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
