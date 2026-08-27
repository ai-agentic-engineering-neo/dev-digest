import type { CSSProperties } from "react";

/** Co-located styles for the multi-agent configure surface (Screens A/B). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
    maxWidth: 560,
  } satisfies CSSProperties,
  body: {
    padding: "0 32px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 720,
  } satisfies CSSProperties,
  resumeCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "16px 18px",
    borderRadius: 10,
    border: "1px solid var(--accent)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  agentListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 4px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentIdentityDot: (color: string): CSSProperties => ({
    width: 20,
    height: 20,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    background: color + "22",
    color,
    flexShrink: 0,
  }),
  agentName: {
    fontSize: 14,
    fontWeight: 500,
    flex: 1,
  } satisfies CSSProperties,
  agentEstimate: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  aggregateRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "10px 0",
  } satisfies CSSProperties,
  runRow: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  loadingStack: {
    padding: 32,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
};
