import type { CSSProperties } from "react";

/** Co-located styles for SkillCard. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 16,
    borderRadius: 10,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--bg-hover)" : "var(--bg-surface)",
    cursor: "pointer",
    // A disabled skill is still listed — it just reads as inactive, because
    // "off" is a state you toggle, not a reason to hide the row.
    opacity: enabled ? 1 : 0.55,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: 650,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  typeChip: (color: string): CSSProperties => ({
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 5,
    color,
    border: `1px solid ${color}`,
    opacity: 0.9,
  }),
  deleteBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
    flexShrink: 0,
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  version: { color: "var(--text-secondary)" } satisfies CSSProperties,
  statsDot: { opacity: 0.6 } satisfies CSSProperties,
} as const;
