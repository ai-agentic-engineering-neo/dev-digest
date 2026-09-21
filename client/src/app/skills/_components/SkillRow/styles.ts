import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  card: (active: boolean, enabled: boolean, blocked: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (blocked ? "var(--crit)" : active ? "var(--border-strong)" : "var(--border)"),
    background: blocked ? "var(--crit-bg)" : active ? "var(--bg-hover)" : "var(--bg-elevated)",
    // A blocked skill is always disabled; keep it fully opaque so the red state stays readable.
    opacity: enabled || blocked ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: (blocked: boolean): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: blocked ? "var(--crit-bg)" : "var(--accent-bg)",
    color: blocked ? "var(--crit)" : "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
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
  tagRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  vetting: { fontSize: 12, color: "var(--warn)", fontWeight: 500 } satisfies CSSProperties,
  metrics: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  accept: { color: "var(--ok)" } satisfies CSSProperties,
} as const;
