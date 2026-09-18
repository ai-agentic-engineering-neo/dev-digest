import type { CSSProperties } from "react";

/** Co-located styles for the findings-by-severity badge + popover. */
export const s = {
  row: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  panel: {
    position: "fixed",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    zIndex: 60,
    width: 360,
    maxHeight: 420,
    overflowY: "auto",
    animation: "ddpop .12s ease",
  } satisfies CSSProperties,
  panelTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  panelFilterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  loading: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,
  item: {
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemFirst: {
    padding: "0 0 8px",
  } satisfies CSSProperties,
  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  } satisfies CSSProperties,
  itemDesc: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } satisfies CSSProperties,
} as const;
