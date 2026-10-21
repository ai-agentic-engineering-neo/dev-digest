import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-flex" } satisfies CSSProperties,
  btn: {
    display: "inline-flex",
    border: "none",
    background: "transparent",
    padding: 2,
    color: "var(--text-muted)",
    cursor: "help",
  } satisfies CSSProperties,
  popover: {
    position: "absolute",
    top: "100%",
    left: 0,
    zIndex: 5,
    marginTop: 4,
    padding: "8px 10px",
    minWidth: 220,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
