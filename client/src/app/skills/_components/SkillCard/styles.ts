import type { CSSProperties } from "react";

/** Co-located styles for SkillCard — mirrors AgentCard's look. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  deleteBtn: (pending: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 2,
  }),
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "6px 0",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
