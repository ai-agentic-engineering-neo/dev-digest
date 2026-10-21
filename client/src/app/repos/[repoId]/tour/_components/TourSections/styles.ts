import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  steps: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  diagram: {
    marginTop: 12,
    padding: 16,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflowX: "auto",
  } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  task: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  taskTitle: { margin: 0, fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  taskWhy: { margin: 0, fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  tasks: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
};
