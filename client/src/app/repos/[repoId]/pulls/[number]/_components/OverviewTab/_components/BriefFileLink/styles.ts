import type { CSSProperties } from "react";

const link = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--accent-text)",
  textDecoration: "none",
  textUnderlineOffset: 2,
  textAlign: "left",
  maxWidth: "100%",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;

const linkHover = {
  color: "var(--accent-hover)",
  textDecoration: "underline",
} as const satisfies CSSProperties;

const reason = {
  color: "var(--text-secondary)",
} as const satisfies CSSProperties;

const text = {
  fontSize: 12,
  color: "var(--text-muted)",
  overflowWrap: "anywhere",
} as const satisfies CSSProperties;

export const s = { link, linkHover, reason, text };
