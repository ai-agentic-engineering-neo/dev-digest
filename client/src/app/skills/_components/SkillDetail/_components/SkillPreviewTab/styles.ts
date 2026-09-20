import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 17, fontWeight: 650 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  note: {
    margin: "0 0 14px",
    padding: "10px 14px",
    borderLeft: "3px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 4,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  card: {
    padding: "22px 28px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;

/** Element styles for the rendered markdown. */
export const md = {
  h1: { fontSize: 22, fontWeight: 650, color: "var(--text-primary)", margin: "0 0 14px" } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 650, color: "var(--text-primary)", margin: "22px 0 8px" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 650, color: "var(--text-primary)", margin: "18px 0 6px" } satisfies CSSProperties,
  p: { margin: "0 0 12px" } satisfies CSSProperties,
  ul: { margin: "0 0 12px", paddingLeft: 22 } satisfies CSSProperties,
  li: { margin: "2px 0" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  code: { fontSize: "0.92em", padding: "1px 6px", borderRadius: 4, background: "var(--bg-hover)", color: "var(--accent-text)" } satisfies CSSProperties,
  pre: { margin: "0 0 12px", padding: 12, borderRadius: 6, background: "var(--code-bg)", overflow: "auto", fontSize: 13 } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
