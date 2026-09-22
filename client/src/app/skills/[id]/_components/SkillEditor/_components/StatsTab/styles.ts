import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 26 } satisfies CSSProperties,
  /** Grid, not flex: MetricCard has flex:1 and would stretch vertically. */
  card: { display: "grid", gap: 8, alignContent: "start" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 } satisfies CSSProperties,
  section: { marginBottom: 24 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agents: { listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  agent: (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: enabled ? "var(--accent-text)" : "var(--text-muted)",
  }),
} as const;
