import type { CSSProperties } from "react";

const link = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--text-secondary)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  textAlign: "left",
  maxWidth: "100%",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;

const text = {
  fontSize: 12,
  color: "var(--text-secondary)",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;

export const s = { link, text };
