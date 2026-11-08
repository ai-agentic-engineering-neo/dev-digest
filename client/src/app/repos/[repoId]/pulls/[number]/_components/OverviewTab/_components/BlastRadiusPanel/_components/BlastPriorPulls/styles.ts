import type { CSSProperties } from "react";

const row = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  padding: "4px 2px",
  fontSize: 12.5,
  color: "var(--text-muted)",
} as const satisfies CSSProperties;

const chevron = { color: "var(--text-muted)", flexShrink: 0, transition: "transform .12s" } as const satisfies CSSProperties;

export const s = {
  /** Pinned to the bottom of the (equal-height) card, separated by a rule like the design. */
  root: { marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  static: row,
  toggle: { ...row, border: "none", background: "transparent", cursor: "pointer", font: "inherit", textAlign: "left" } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  count: {
    marginLeft: "auto",
    padding: "0 6px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontSize: 11.5,
    fontWeight: 600,
  } satisfies CSSProperties,
  chevron,
  chevronOpen: { ...chevron, transform: "rotate(180deg)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 2, padding: "2px 2px 2px 22px", minWidth: 0 } satisfies CSSProperties,
  link: {
    fontSize: 13,
    color: "var(--text-primary)",
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  number: { color: "var(--text-muted)" } satisfies CSSProperties,
  meta: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  /** Visually hidden, still read by screen readers (no utility class is guaranteed to exist). */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  note: { fontSize: 12, lineHeight: 1.5, color: "var(--text-muted)", margin: "4px 0 0" } satisfies CSSProperties,
} as const;
