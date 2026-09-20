import type { CSSProperties } from "react";

/** Co-located styles for SkillCard (mirrors AgentCard). */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: (color: string): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: color + "1a",
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
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
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  sourceLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
