import type { CSSProperties } from "react";

const root = { position: "relative", display: "inline-flex" } as const satisfies CSSProperties;
const button = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 2,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
  borderRadius: 4,
} as const satisfies CSSProperties;
const bubble = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  zIndex: 10,
  width: "max-content",
  maxWidth: 320,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.4,
  color: "var(--text-secondary)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
} as const satisfies CSSProperties;

export const s = { root, button, bubble };
