import type { CSSProperties } from "react";

/** Co-located styles for SkillCard — same chrome as AgentCard's grid card
 * (`app/agents/_components/AgentCard`), so the two list pages read as one
 * system, with the icon/chip colour keyed off the skill's type instead of a
 * fixed accent. */
export const s = {
  card: (enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
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
  typeChip: (color: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 8px",
    borderRadius: 4,
  }),
  deleteBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  } satisfies CSSProperties,
} as const;
