import type { CSSProperties } from "react";
import type { DiffOp } from "./helpers";

/** Co-located styles for the skill VersionsTab. */
export const s = {
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "4px 0 18px",
    maxWidth: 620,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    marginBottom: 8,
  } satisfies CSSProperties,
  versionChip: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "3px 8px",
    borderRadius: 5,
  } satisfies CSSProperties,
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "16px 20px",
    fontSize: 12.5,
    lineHeight: 1.6,
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  diffLine: (op: DiffOp): CSSProperties => ({
    display: "flex",
    gap: 8,
    padding: "0 6px",
    background:
      op === "add" ? "var(--ok-bg)" : op === "remove" ? "var(--crit-bg)" : "transparent",
    color: op === "same" ? "var(--text-muted)" : "var(--text-primary)",
  }),
  diffSign: { width: 10, flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
