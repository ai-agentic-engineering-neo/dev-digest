import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  separator: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  pill: (color: string, bg: string, pressed: boolean, faded: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    cursor: "pointer",
    color,
    background: pressed ? bg : "transparent",
    border: `1px solid ${pressed ? color : "var(--border)"}`,
    opacity: faded ? 0.55 : 1,
    transition: "all .12s",
  }),
} as const;
