import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
