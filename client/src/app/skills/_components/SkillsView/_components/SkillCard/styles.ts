import type { CSSProperties } from "react";

/** Co-located styles for SkillCard. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
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
    padding: 4,
  }),
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
