import type { CSSProperties } from "react";
import type { DiffLineKind } from "./helpers";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 16px" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 8,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  version: { fontWeight: 700, fontSize: 13 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 6 } satisfies CSSProperties,
  diff: { margin: 0, padding: "12px 0", fontSize: 13, lineHeight: 1.5 } satisfies CSSProperties,
  diffLine: (kind: DiffLineKind): CSSProperties => ({
    padding: "0 16px",
    whiteSpace: "pre-wrap",
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-secondary)",
  }),
  noChanges: { padding: 20, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
