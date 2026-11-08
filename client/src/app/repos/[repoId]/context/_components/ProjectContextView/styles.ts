import type { CSSProperties } from "react";

/** Topbar height incl. border (src/vendor/ui/shell/Topbar.tsx `height: 52`); AppFrame only has minHeight. */
export const TOPBAR_HEIGHT_PX = 52;

export const s = {
  root: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr)",
    height: `calc(100vh - ${TOPBAR_HEIGHT_PX}px)`,
    minHeight: 0,
    overflow: "hidden",
  } satisfies CSSProperties,
  left: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  panelHead: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "16px 16px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    minWidth: 0,
  } satisfies CSSProperties,
  panelTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  panelRepo: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  block: { padding: "8px 12px", flexShrink: 0 } satisfies CSSProperties,
  note: { padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  treeRegion: { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 8px" } satisfies CSSProperties,
  footer: {
    padding: "10px 16px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,
  right: { height: "100%", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  docRegion: { flex: 1, minHeight: 0, overflow: "auto", padding: "20px 28px" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8, padding: "8px 12px" } satisfies CSSProperties,
} as const;
