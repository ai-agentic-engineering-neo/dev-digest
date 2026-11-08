import type { CSSProperties } from "react";

/** Same bounded width as the Skills tab. */
const COLUMN_MAX_WIDTH = 860;

/** Co-located styles for the agent's Context tab. */
export const s = {
  column: { maxWidth: COLUMN_MAX_WIDTH, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  alert: {
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 8,
    padding: "8px 12px",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 220,
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listSkeleton: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  /** The list scrolls; the footer below it stays visible. */
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflowY: "auto",
    maxHeight: "calc(100vh - 360px)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  footerTokens: (over: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: over ? "var(--crit)" : "var(--text-secondary)",
  }),
  footerNote: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  drawerTitle: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  drawerPath: { fontSize: 14, overflowWrap: "anywhere" } satisfies CSSProperties,
  drawerMeta: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  drawerBody: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  docBox: {
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
