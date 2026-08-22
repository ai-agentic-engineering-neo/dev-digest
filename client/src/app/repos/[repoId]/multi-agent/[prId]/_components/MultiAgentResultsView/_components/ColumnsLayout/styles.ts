import type { CSSProperties } from "react";

export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  identityDot: (color: string): CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "grid",
    placeItems: "center",
    background: color + "22",
    color,
    flexShrink: 0,
  }),
  agentName: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  noScore: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    gap: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  errorBox: {
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 12,
  } satisfies CSSProperties,
  findingsCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
  } satisfies CSSProperties,
  findingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  findingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  } satisfies CSSProperties,
  findingTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingFile: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
};
