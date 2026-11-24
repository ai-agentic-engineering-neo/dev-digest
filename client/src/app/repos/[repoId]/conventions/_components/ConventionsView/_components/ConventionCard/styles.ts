import type { CSSProperties } from "react";

export const s = {
  card: (accepted: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 16,
    padding: 16,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border-strong)"}`,
    borderRadius: 10,
  }),
  main: { minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  ruleRow: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  rule: { fontSize: 15, fontWeight: 600, fontStyle: "italic", flex: 1, margin: 0 } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, alignItems: "center", flex: 1 } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--code-bg)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidencePath: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 10px",
    fontSize: 12,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowX: "auto",
  } satisfies CSSProperties,
  confRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  confBar: { width: 100 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8, width: 140 } satisfies CSSProperties,
} as const;
