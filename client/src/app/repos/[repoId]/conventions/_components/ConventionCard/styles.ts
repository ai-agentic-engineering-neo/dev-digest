import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";

/** Styles for a candidate card. */
export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: 16,
    borderRadius: 10,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    // The accent stripe reads the triage state at a glance.
    borderLeft: `3px solid ${status === "accepted" ? "var(--ok)" : "var(--accent)"}`,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  rule: { fontSize: 15, fontWeight: 600, fontStyle: "italic", flex: 1, minWidth: 0 } satisfies CSSProperties,
  rationale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "0 0 12px",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  evidence: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  evidenceLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "var(--accent)",
    textDecoration: "none",
    fontSize: 11.5,
  } satisfies CSSProperties,
  evidenceCode: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 12.5,
    lineHeight: 1.6,
    overflowX: "auto",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  confidenceBar: { width: 100 } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 128,
    flexShrink: 0,
  } satisfies CSSProperties,
  editForm: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, marginTop: 4 } satisfies CSSProperties,
};
