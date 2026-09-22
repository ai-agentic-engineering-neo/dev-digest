import type { CSSProperties } from "react";
import { CARD_MAX_HEIGHT, CARD_WIDTH } from "./constants";

/** Co-located styles for the findings hover card (the cell itself uses the
 *  page-level styles in ../../styles.ts, like every other PRRow cell). */
export const c = {
  card: (top: number, left: number): CSSProperties => ({
    // Fixed + portalled: the PR table card sets `overflow: hidden`, which would
    // clip anything positioned inside the row.
    position: "fixed",
    top,
    left,
    width: CARD_WIDTH,
    zIndex: 60,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,.28)",
    overflow: "hidden",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    maxHeight: CARD_MAX_HEIGHT,
    overflowY: "auto",
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  item: {
    padding: "8px 8px 10px",
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  itemHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  itemIcon: (color: string): CSSProperties => ({ color, flexShrink: 0 }),
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemFile: {
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  /** Two-line preview of the rationale — plain text, not markdown. */
  itemRationale: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  state: {
    padding: "14px",
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  skeletonStack: {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
