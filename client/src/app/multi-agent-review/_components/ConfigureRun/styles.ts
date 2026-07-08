import type { CSSProperties } from "react";

export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
    // Match the design: padded and centered rather than flush to the shell.
    padding: "24px 28px 44px",
    maxWidth: 760,
    margin: "0 auto",
    width: "100%",
  } satisfies CSSProperties,
  step: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  stepHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  } satisfies CSSProperties,
  stepNumber: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  stepTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  pickerRow: {
    display: "flex",
    gap: 12,
  } satisfies CSSProperties,
  pickerCol: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  disabledWrap: {
    opacity: 0.55,
    pointerEvents: "none",
  } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  agentCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
  } satisfies CSSProperties,
  agentMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies CSSProperties,
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  agentTeaser: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  agentEstimate: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
    whiteSpace: "nowrap",
    marginTop: 2,
  } satisfies CSSProperties,
  summaryBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  summaryText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  configureLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
