import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  grow: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  type: { width: 180 } satisfies CSSProperties,
  modeSwitch: { display: "flex", gap: 6 } satisfies CSSProperties,
  preview: {
    minHeight: 200,
    maxHeight: 360,
    overflow: "auto",
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
