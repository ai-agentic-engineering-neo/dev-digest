import type { CSSProperties } from "react";

/** Co-located styles for SkillStatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  tileWrap: { position: "relative", flex: 1, display: "flex" } satisfies CSSProperties,
  ring: { position: "absolute", top: 14, right: 14 } satisfies CSSProperties,
  panels: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 8,
  } satisfies CSSProperties,
  agentIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  agentName: { flex: 1, fontSize: 13, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  openLink: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  donutWrap: { display: "flex", justifyContent: "center", padding: "8px 0" } satisfies CSSProperties,
} as const;
