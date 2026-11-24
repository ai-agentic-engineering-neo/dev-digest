import type { CSSProperties } from "react";
import { POPOVER_WIDTH } from "./constants";

/** Where the preview is pinned, in viewport coordinates. */
export interface PopoverAnchor {
  left: number;
  /** Set when the preview opens below the cell. */
  top?: number;
  /** Set when it opens above the cell (not enough room below). */
  bottom?: number;
}

/** Co-located styles for FindingsCell and its preview. */
export const s = {
  cell: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    borderRadius: 6,
    cursor: "pointer",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  /**
   * `position: fixed` because the table card clips its children
   * (`overflow: hidden`). The padding is a transparent bridge between the cell
   * and the card, so the pointer can travel onto the preview without leaving
   * the cell's subtree.
   */
  popover: (anchor: PopoverAnchor): CSSProperties => ({
    position: "fixed",
    left: anchor.left,
    top: anchor.top,
    bottom: anchor.bottom,
    width: POPOVER_WIDTH,
    padding: "6px 0",
    zIndex: 40,
    cursor: "default",
  }),
  card: {
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    boxShadow: "var(--shadow-modal)",
    overflow: "hidden",
    textAlign: "left",
  } satisfies CSSProperties,
  title: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: "4px 0" } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "7px 14px",
  } satisfies CSSProperties,
  itemIcon: (color: string): CSSProperties => ({ color, flexShrink: 0, marginTop: 2 }),
  itemBody: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 550,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  itemMeta: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  note: {
    padding: "8px 14px 10px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
