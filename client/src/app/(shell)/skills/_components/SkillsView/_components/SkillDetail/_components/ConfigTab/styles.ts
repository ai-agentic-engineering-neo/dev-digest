import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab (mirrors agents' ConfigTab/styles.ts, plus
   the hand-written line-numbered body editor). */
export const s = {
  wrap: { maxWidth: 780 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,

  // ---- Body editor panel ----
  editorPanel: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  editorHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filename: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokenCount: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  editorBody: { display: "flex", height: 320 } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    width: 44,
    overflow: "hidden",
    padding: "10px 0",
    textAlign: "right",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
  } satisfies CSSProperties,
  gutterLine: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--text-muted)",
    paddingRight: 8,
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "none",
    border: "none",
    outline: "none",
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: "20px",
    background: "transparent",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
