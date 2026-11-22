import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  pill: (color: string, active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 99,
    border: `1px solid ${color}`,
    background: active ? color : "transparent",
    color: active ? "#fff" : color,
    overflow: "hidden",
    transition: "background .12s, color .12s",
  }),
  main: {
    background: "none",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    padding: "5px 4px 5px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  info: {
    background: "none",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    padding: "5px 10px 5px 4px",
    display: "inline-flex",
    alignItems: "center",
    opacity: 0.8,
  } satisfies CSSProperties,
} as const;
