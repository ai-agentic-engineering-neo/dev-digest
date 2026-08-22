import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 700,
    margin: 0,
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 0",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  conflictRow: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  conflictHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 8,
  } satisfies CSSProperties,
  conflictLocation: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  conflictTitle: {
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  takes: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  } satisfies CSSProperties,
  take: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  ignored: {
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  note: {
    color: "var(--text-secondary)",
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
