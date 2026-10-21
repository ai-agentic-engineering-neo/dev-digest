import type { CSSProperties } from "react";

export const s = {
  nav: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  title: {
    margin: "0 0 12px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  link: (active: boolean): CSSProperties => ({
    display: "block",
    padding: "7px 12px",
    fontSize: 14,
    textDecoration: "none",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 550 : 400,
    borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
  }),
};
