import type { CSSProperties } from "react";

const option = {
  padding: "3px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 5,
  border: "none",
  cursor: "pointer",
  textTransform: "capitalize",
  background: "transparent",
  color: "var(--text-muted)",
} as const satisfies CSSProperties;

export const s = {
  root: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    flexShrink: 0,
  } satisfies CSSProperties,
  option,
  active: { ...option, background: "var(--bg-elevated)", color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
