import type { CSSProperties } from "react";
import type { DiffLine } from "./helpers";

const DIFF_COLORS: Record<DiffLine["kind"], { bg: string; color: string }> = {
  add: { bg: "var(--ok-bg)", color: "var(--ok)" },
  del: { bg: "var(--crit-bg)", color: "var(--crit)" },
  same: { bg: "transparent", color: "var(--text-secondary)" },
};

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 16px" } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    border: `1px solid ${current ? "var(--border-strong)" : "var(--border)"}`,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  }),
  rowHead: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" } satisfies CSSProperties,
  expand: (current: boolean): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    width: 22,
    height: 22,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: current ? "default" : "pointer",
    visibility: current ? "hidden" : "visible",
  }),
  chevron: (open: boolean): CSSProperties => ({ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }),
  version: { fontSize: 13, fontWeight: 700, minWidth: 34 } satisfies CSSProperties,
  message: { flex: 1, fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  diff: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "8px 0",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (kind: DiffLine["kind"]): CSSProperties => ({
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    padding: "0 14px",
    background: DIFF_COLORS[kind].bg,
    color: DIFF_COLORS[kind].color,
  }),
  sign: { display: "inline-block", width: 16, userSelect: "none" } satisfies CSSProperties,
} as const;
