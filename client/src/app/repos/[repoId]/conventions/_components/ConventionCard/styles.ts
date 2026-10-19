import type { CSSProperties } from "react";

export const s = {
  card: (dimmed: boolean): CSSProperties => ({
    display: "flex",
    gap: 20,
    padding: "18px 20px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    opacity: dimmed ? 0.55 : 1,
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  head: { display: "flex", gap: 6, alignItems: "center" } satisfies CSSProperties,
  rule: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: { padding: "6px 12px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 140 } satisfies CSSProperties,
  pct: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", minWidth: 150 } satisfies CSSProperties,
} as const;
