import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    flex: 1,
  } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
  block: {
    margin: 0,
    padding: 16,
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    maxHeight: "56vh",
    overflow: "auto",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
