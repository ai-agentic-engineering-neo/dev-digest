import type { CSSProperties } from "react";

const INDENT = 18;
const BRANCH_X = 10; // x of the vertical branch line inside the caller list

const header = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 6px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
} as const satisfies CSSProperties;

const chevron = {
  color: "var(--text-muted)",
  flexShrink: 0,
  transition: "transform .12s",
} as const satisfies CSSProperties;

const branch = {
  position: "absolute",
  left: BRANCH_X,
  top: 0,
  bottom: 0,
  width: 1,
  background: "var(--border-strong)",
} as const satisfies CSSProperties;

export const s = {
  node: { borderBottom: "1px solid var(--border)", padding: "3px 0" } satisfies CSSProperties,
  header,
  headerOpen: { ...header, background: "var(--bg-hover)" } satisfies CSSProperties,
  chevron,
  chevronOpen: { ...chevron, transform: "rotate(90deg)" } satisfies CSSProperties,
  symbolIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  symbol: {
    fontSize: 12.5,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 } satisfies CSSProperties,
  body: { padding: "4px 0 8px 14px" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: `3px 0 3px ${INDENT}px`,
    fontSize: 12.5,
    minWidth: 0,
  } satisfies CSSProperties,
  branch,
  branchLast: { ...branch, bottom: "50%" } satisfies CSSProperties,
  tick: {
    position: "absolute",
    left: BRANCH_X,
    top: "50%",
    width: INDENT - BRANCH_X - 2,
    height: 1,
    background: "var(--border-strong)",
  } satisfies CSSProperties,
  rowIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  /** Holds the full `file:line` tooltip; the visible path is already shortened, so it never needs clipping. */
  locationBox: { whiteSpace: "nowrap", flexShrink: 0 } satisfies CSSProperties,
  location: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  /** Caller function name is shown in full (wraps rather than being cut). */
  caller: { fontSize: 11.5, color: "var(--text-muted)", overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  chips: { display: "flex", flexDirection: "column", gap: 6, padding: `8px 0 2px ${INDENT}px` } satisfies CSSProperties,
} as const;
