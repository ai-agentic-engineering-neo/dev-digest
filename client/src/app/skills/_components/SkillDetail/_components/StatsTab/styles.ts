import type { CSSProperties } from "react";

/** Co-located styles for the skill StatsTab. */
export const s = {
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  } satisfies CSSProperties,
  metric: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metricValue: {
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    display: "flex",
    alignItems: "baseline",
    gap: 6,
  } satisfies CSSProperties,
  metricUnit: { fontSize: 13, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 8,
  } satisfies CSSProperties,
  emptyNote: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
