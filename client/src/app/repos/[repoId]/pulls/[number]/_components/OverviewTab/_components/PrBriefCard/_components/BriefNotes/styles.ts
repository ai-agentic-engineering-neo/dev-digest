import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 8 } as const satisfies CSSProperties;
const box = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "8px 10px",
  border: "1px solid var(--warn)",
  background: "var(--warn-bg)",
  borderRadius: 6,
} as const satisfies CSSProperties;
const icon = { flexShrink: 0, marginTop: 1, color: "var(--warn)" } as const satisfies CSSProperties;
const title = { margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" } as const satisfies CSSProperties;
const list = { margin: "4px 0 0", padding: "0 0 0 16px", fontSize: 12, color: "var(--text-secondary)" } as const satisfies CSSProperties;
const truncated = { margin: 0, fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;

export const s = { root, box, icon, title, list, truncated };
