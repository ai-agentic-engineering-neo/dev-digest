import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";

const BORDER: Record<ConventionStatus, string> = {
  accepted: "var(--ok)",
  rejected: "var(--border)",
  pending: "var(--border)",
};

/** Styles for one convention candidate card. */
export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    border: `1px solid ${BORDER[status]}`,
    borderRadius: 12,
    background: "var(--bg-surface)",
    padding: "var(--card-pad)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    opacity: status === "rejected" ? 0.6 : 1,
  }),
  head: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  ruleCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  rule: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.45,
    background: "none",
    border: "none",
    padding: 0,
    textAlign: "left",
    cursor: "text",
    font: "inherit",
  } satisfies CSSProperties,
  badges: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  editActions: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "block",
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    color: "var(--text-muted)",
    textDecoration: "none",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  confidenceBar: { width: 140 } satisfies CSSProperties,
  confidenceText: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
