import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
    marginBottom: 24,
  } satisfies CSSProperties,
  intentSignals: {
    marginTop: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  intentEmpty: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: 18,
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 24,
  } satisfies CSSProperties,
  intentSummary: {
    fontStyle: "italic",
    color: "var(--text)",
    marginBottom: 14,
  } satisfies CSSProperties,
  scopeColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  } satisfies CSSProperties,
  scopeHeading: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  scopeList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  scopeListEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  contextGapsNote: {
    marginTop: 14,
    fontSize: 12.5,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
