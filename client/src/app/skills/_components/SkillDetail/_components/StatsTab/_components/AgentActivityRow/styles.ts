import type { CSSProperties } from "react";

/** Co-located styles for AgentActivityRow. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 18px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  activity: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  accept: (color: string): CSSProperties => ({ color, fontWeight: 600 }),
  open: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent)",
    textDecoration: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
};
