import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  metricValue: { fontSize: 22, display: "block" } satisfies CSSProperties,
  metricSub: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    marginTop: 4,
    letterSpacing: 0,
  } satisfies CSSProperties,
  panel: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    overflow: "hidden",
  } satisfies CSSProperties,
  panelHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "14px 18px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  panelTitle: { fontSize: 14, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  panelSub: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  skeletonMetric: { flex: 1, minWidth: 140 } satisfies CSSProperties,
  skeletonRow: { padding: "14px 18px" } satisfies CSSProperties,
};
