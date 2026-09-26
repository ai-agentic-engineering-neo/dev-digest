import type { CSSProperties } from "react";

export const s = {
  card: (accepted: boolean): CSSProperties => ({
    padding: "16px 18px",
    borderRadius: 10,
    border: `1px solid ${accepted ? "var(--ok)" : "var(--border)"}`,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }),
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  } satisfies CSSProperties,
  ruleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sourceLink: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  confidenceWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 140,
  } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  editFieldsRow: {
    display: "flex",
    gap: 8,
  } satisfies CSSProperties,
};
