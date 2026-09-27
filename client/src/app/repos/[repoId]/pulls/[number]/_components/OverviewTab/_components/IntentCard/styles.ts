import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — mirrors OverviewTab's descriptionBox. */
export const s = {
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    fontStyle: "italic",
    margin: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  emptyBody: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: "0 0 12px",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginTop: 14,
  } satisfies CSSProperties,
  scopeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  meta: {
    marginTop: 14,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  riskAreas: {
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  riskEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  riskChipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  riskDetail: {
    marginTop: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: 12,
  } satisfies CSSProperties,
  riskExplanation: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  riskFileRefs: {
    marginTop: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
