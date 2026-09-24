import type { CSSProperties } from "react";
import type { ConventionStatus } from "@devdigest/shared";
import type { ConfidenceTone } from "../../helpers";

const EDGE: Record<ConventionStatus, string> = {
  accepted: "var(--ok)",
  pending: "var(--border-strong)",
  rejected: "var(--border)",
};

export const TONE_COLOR: Record<ConfidenceTone, string> = {
  high: "var(--ok)",
  warn: "var(--warn)",
  low: "var(--crit)",
};

/** Co-located styles for ConventionCard. */
export const s = {
  card: (status: ConventionStatus): CSSProperties => ({
    display: "flex",
    gap: 20,
    padding: "18px 20px 16px 22px",
    borderRadius: 10,
    background: "var(--bg-surface)",
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: `3px solid ${EDGE[status]}`,
    opacity: status === "rejected" ? 0.6 : 1,
    transition: "opacity .12s",
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  rule: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.4,
    letterSpacing: "-0.01em",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  skillLink: { fontSize: 12, color: "var(--accent-text)" } satisfies CSSProperties,
  evidence: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 6px 4px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  evidencePath: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "12px 18px",
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: "pre",
    overflowX: "auto",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  moreBtn: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "var(--accent-text)",
    cursor: "pointer",
  } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  track: {
    width: 140,
    height: 6,
    borderRadius: 99,
    background: "var(--bg-hover)",
    overflow: "hidden",
  } satisfies CSSProperties,
  fill: (pct: number, color: string): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    borderRadius: 99,
    background: color,
  }),
  pct: { color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  editForm: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  editRow: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
