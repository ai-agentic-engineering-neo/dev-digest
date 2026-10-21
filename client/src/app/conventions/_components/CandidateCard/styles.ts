import type { CSSProperties } from "react";

/** Co-located styles for CandidateCard. */
export const s = {
  card: (status: "candidate" | "accepted" | "rejected"): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${status === "accepted" ? "var(--ok)" : "var(--border)"}`,
    borderLeftWidth: status === "accepted" ? 3 : 1,
    background: "var(--bg-surface)",
    opacity: status === "rejected" ? 0.55 : 1,
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  ruleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, fontStyle: "italic", flex: 1, minWidth: 0 } satisfies CSSProperties,
  evidence: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--code-bg)", overflow: "hidden" } satisfies CSSProperties,
  evidenceHead: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  snippet: { margin: 0, padding: "8px 10px", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--text-primary)" } satisfies CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 120 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 6, width: 120, flexShrink: 0 } satisfies CSSProperties,
  editForm: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, alignItems: "flex-end" } satisfies CSSProperties,
} as const;
