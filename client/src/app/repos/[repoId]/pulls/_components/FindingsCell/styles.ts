import type { CSSProperties } from "react";

const POPOVER_WIDTH = 360;

export const s = {
  cell: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    cursor: "pointer",
  } satisfies CSSProperties,
  popover: (rect: DOMRect): CSSProperties => ({
    position: "fixed",
    top: rect.bottom + 6,
    left:
      typeof window === "undefined"
        ? rect.left
        : Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
    width: POPOVER_WIDTH,
    maxHeight: 360,
    overflowY: "auto",
    zIndex: 100,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
    padding: 12,
    cursor: "default",
  }),
  popoverHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  popoverLoading: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "4px 0",
  } satisfies CSSProperties,
  findingRow: {
    display: "flex",
    gap: 8,
    padding: "8px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  findingMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies CSSProperties,
  findingTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  findingTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  findingMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  findingRationale: {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
