import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";

const ACCENT: Record<ConventionStatus, string> = {
  accepted: "var(--ok)",
  rejected: "var(--border)",
  pending: "var(--border-strong)",
};

export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 210px",
    gap: 20,
    padding: "18px 20px",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${ACCENT[status]}`,
    borderRadius: 12,
    background: "var(--bg-surface)",
    opacity: status === "rejected" ? 0.6 : 1,
    transition: "opacity .15s",
  }),
  main: { minWidth: 0, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  rule: { fontSize: 15, fontWeight: 600, fontStyle: "italic", lineHeight: 1.4 } satisfies CSSProperties,
  evidence: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  evidencePath: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 14px",
    fontSize: 12.5,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  noEvidence: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceBar: { width: 120 } satisfies CSSProperties,
  confidencePct: { color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
