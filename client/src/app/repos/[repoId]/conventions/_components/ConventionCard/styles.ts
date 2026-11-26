import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (rejected: boolean, accepted: boolean): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: "16px 18px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border)"}`,
    background: "var(--bg-surface)",
    opacity: rejected ? 0.55 : 1,
  }),
  select: { paddingTop: 2, width: 16, flexShrink: 0 } satisfies CSSProperties,
  /** Visually hidden, still read by screen readers (no global sr-only class exists). */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  rule: { fontSize: 14.5, fontWeight: 600, fontStyle: "italic", color: "var(--text-primary)" } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-primary)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  path: { fontFamily: "var(--font-mono)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  github: { color: "var(--accent)", fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" } satisfies CSSProperties,
  code: {
    margin: 0,
    padding: "8px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,
  badLabel: { fontSize: 12, color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 120 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 6, width: 130, flexShrink: 0 } satisfies CSSProperties,
} as const;
