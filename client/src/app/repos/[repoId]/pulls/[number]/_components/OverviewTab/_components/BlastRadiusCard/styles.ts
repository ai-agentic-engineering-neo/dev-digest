import type { CSSProperties } from "react";

export const s = {
  box: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  comingSoon: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  summaryChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  } satisfies CSSProperties,
  summaryText: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: "0 0 14px",
  } satisfies CSSProperties,
  degradedText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--warn, #b8860b)",
    margin: "0 0 14px",
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  symbolChipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  detail: {
    marginTop: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    padding: 12,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "4px 0",
  } satisfies CSSProperties,
  callerName: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  emptyCallers: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  factsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
