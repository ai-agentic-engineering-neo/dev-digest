import type { CSSProperties } from "react";
import type { NodeKind } from "./helpers";

export const STROKE: Record<NodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--info)",
  cron: "var(--warn)",
  more: "var(--border)",
};

export const s = {
  svg: { width: "100%", height: "auto", display: "block", overflow: "visible" } satisfies CSSProperties,
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  dot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
    display: "inline-block",
  }),
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "6px 0" } satisfies CSSProperties,
} as const;
