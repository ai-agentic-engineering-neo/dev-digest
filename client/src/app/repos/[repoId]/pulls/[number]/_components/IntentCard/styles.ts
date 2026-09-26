import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  summary: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginTop: 0,
    marginBottom: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginBottom: 14,
  } satisfies CSSProperties,

  scopeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  scopeLabelInScope: { color: "var(--ok)" } satisfies CSSProperties,
  scopeLabelOutOfScope: { color: "var(--text-muted)" } satisfies CSSProperties,

  scopeList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  scopeItem: {
    display: "flex",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  scopeItemMarker: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  scopeEmpty: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,

  hint: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 8,
    lineHeight: 1.4,
  } satisfies CSSProperties,

  sourcesLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginTop: 10,
    marginBottom: 8,
  } satisfies CSSProperties,
  sourcesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  } satisfies CSSProperties,

  meta: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  } satisfies CSSProperties,

  mutationError: {
    marginTop: 10,
    fontSize: 12.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
} as const;
