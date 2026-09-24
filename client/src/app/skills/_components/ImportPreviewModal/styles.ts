import type { CSSProperties } from "react";

/** Co-located styles for ImportPreviewModal. */
export const s = {
  source: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 4 } satisfies CSSProperties,
  sourceRef: { fontSize: 12, color: "var(--text-muted)", wordBreak: "break-all" } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  trustIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  chips: { display: "inline-flex", gap: 6 } satisfies CSSProperties,
  bodyBox: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    maxHeight: 280,
    overflow: "auto",
    fontSize: 14,
    marginBottom: 20,
  } satisfies CSSProperties,
  raw: { fontSize: 12.5, whiteSpace: "pre-wrap", margin: 0 } satisfies CSSProperties,
  section: { marginBottom: 16 } satisfies CSSProperties,
  list: { listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  included: { fontSize: 12.5, color: "var(--text-primary)" } satisfies CSSProperties,
  ignored: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  warning: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
} as const;
