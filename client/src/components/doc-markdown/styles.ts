import type { CSSProperties } from "react";

const MONO = "var(--font-mono)";

export const s = {
  root: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.3, margin: "20px 0 10px" } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 650, lineHeight: 1.35, margin: "18px 0 8px" } satisfies CSSProperties,
  h3: { fontSize: 15, fontWeight: 600, lineHeight: 1.4, margin: "14px 0 6px" } satisfies CSSProperties,
  p: { margin: "0 0 10px" } satisfies CSSProperties,
  ul: { listStyleType: "disc", paddingLeft: 22, margin: "0 0 10px" } satisfies CSSProperties,
  ol: { listStyleType: "decimal", paddingLeft: 22, margin: "0 0 10px" } satisfies CSSProperties,
  li: { margin: "2px 0" } satisfies CSSProperties,
  inlineCode: {
    fontFamily: MONO,
    fontSize: "0.9em",
    padding: "1px 5px",
    borderRadius: 4,
    backgroundColor: "var(--code-bg)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  pre: {
    fontFamily: MONO,
    fontSize: 12.5,
    lineHeight: 1.55,
    padding: "10px 12px",
    margin: "0 0 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    backgroundColor: "var(--code-bg)",
    overflow: "auto",
  } satisfies CSSProperties,
  blockCode: { fontFamily: MONO, whiteSpace: "pre" } satisfies CSSProperties,
  strong: { fontWeight: 650 } satisfies CSSProperties,
  em: { fontStyle: "italic" } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  blockquote: {
    margin: "0 0 10px",
    padding: "2px 12px",
    borderLeft: "3px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
