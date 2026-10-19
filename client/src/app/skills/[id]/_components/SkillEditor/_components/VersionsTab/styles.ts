import type { CSSProperties } from "react";
import type { DiffOp } from "./helpers";

const DIFF_BG: Record<DiffOp, string> = { add: "var(--code-add)", del: "var(--code-del)", same: "transparent" };
const DIFF_FG: Record<DiffOp, string> = {
  add: "var(--code-add-text)",
  del: "var(--code-del-text)",
  same: "var(--text-secondary)",
};

export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" } satisfies CSSProperties,
  chip: (current: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 5,
    color: current ? "var(--accent)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    flexShrink: 0,
  }),
  meta: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: (note: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 500,
    color: note ? "var(--text-primary)" : "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
  date: { fontSize: 11, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  current: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ok)",
    background: "var(--ok-bg)",
    padding: "3px 9px",
    borderRadius: 5,
  } satisfies CSSProperties,
  dot: { width: 6, height: 6, borderRadius: "50%", background: "var(--ok)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diff: { borderTop: "1px solid var(--border)", background: "var(--code-bg)" } satisfies CSSProperties,
  diffHead: { fontSize: 11, color: "var(--text-muted)", padding: "8px 14px 0" } satisfies CSSProperties,
  diffBody: {
    margin: 0,
    padding: "8px 0 12px",
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: 360,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  diffLine: (op: DiffOp): CSSProperties => ({ padding: "0 14px", background: DIFF_BG[op], color: DIFF_FG[op] }),
} as const;
