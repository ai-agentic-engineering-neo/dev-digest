import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  emptyCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  } satisfies CSSProperties,
  emptyText: {
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  emptyHint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,

  quote: {
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginTop: 0,
    marginBottom: 14,
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  scopeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    marginBottom: 7,
    textTransform: "uppercase",
  } satisfies CSSProperties,

  risks: {
    marginTop: 16,
  } satisfies CSSProperties,
  risksLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,

  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: "9px 11px",
    borderRadius: 7,
    background: "var(--info-bg)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  staleNotice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: "9px 11px",
    borderRadius: 7,
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.45,
  } satisfies CSSProperties,

  derivedFrom: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  derivedFromLabel: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sourceUsed: {
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  sourceUnresolved: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  truncatedTag: {
    color: "var(--text-muted)",
    fontSize: 11,
  } satisfies CSSProperties,

  meta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  error: {
    marginTop: 12,
    padding: "9px 11px",
    borderRadius: 7,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12.5,
    lineHeight: 1.45,
  } satisfies CSSProperties,
} as const;
