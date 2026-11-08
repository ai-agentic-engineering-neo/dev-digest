import type { CSSProperties } from "react";
import type { GraphNodeKind } from "./helpers";

/** Node border per column: changed symbols and endpoints in accent, callers neutral (as in the prototype). */
export const STROKE: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent)",
};

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  svg: { display: "block", maxWidth: 560, height: "auto" } satisfies CSSProperties,
  label: { fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--text-primary)" } satisfies CSSProperties,
  legend: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 11, color: "var(--text-muted)", paddingLeft: 4 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  dot: { width: 9, height: 9, borderRadius: 3, border: "1.5px solid", background: "var(--bg-elevated)" } satisfies CSSProperties,
  note: { fontSize: 12, lineHeight: 1.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
