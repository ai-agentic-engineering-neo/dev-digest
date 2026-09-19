import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { fontSize: 15, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  // Longhand, not the `border` shorthand: `versionCurrent` overrides only the
  // colour, and React warns when the two forms are mixed on one element.
  version: {
    fontWeight: 700,
    fontSize: 12.5,
    padding: "2px 8px",
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /** The current row's chip carries the accent so the newest version reads at a glance. */
  versionCurrent: {
    borderColor: "var(--accent)",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  currentBadge: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
  message: { flex: 1, color: "var(--text-secondary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  diffPanel: {
    marginTop: -4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (op: "equal" | "add" | "remove"): CSSProperties => ({
    padding: "1px 8px",
    whiteSpace: "pre-wrap",
    background: op === "add" ? "var(--ok-bg, rgba(0,200,0,.08))" : op === "remove" ? "var(--crit-bg)" : "transparent",
    color: op === "add" ? "var(--ok)" : op === "remove" ? "var(--crit)" : "var(--text-secondary)",
  }),
} as const;
