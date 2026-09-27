import type { CSSProperties } from "react";

/** Co-located styles for the markdown body editor (gutter + textarea). */
const FONT = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)";
const LINE_HEIGHT = 21;

export const LINE_HEIGHT_PX = LINE_HEIGHT;

export const s = {
  frame: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
  } satisfies CSSProperties,
  filename: { color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", alignItems: "stretch" } satisfies CSSProperties,
  gutter: {
    padding: "10px 8px 10px 12px",
    textAlign: "right",
    userSelect: "none",
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    fontFamily: FONT,
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    overflow: "hidden",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "vertical",
    minHeight: 320,
    padding: "10px 12px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: FONT,
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
