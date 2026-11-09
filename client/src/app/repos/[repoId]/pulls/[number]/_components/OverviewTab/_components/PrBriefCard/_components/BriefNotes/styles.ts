import type { CSSProperties } from "react";

const root = { display: "flex", flexDirection: "column", gap: 4 } as const satisfies CSSProperties;
const title = { margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } as const satisfies CSSProperties;
const list = { margin: 0, padding: "0 0 0 16px", fontSize: 12, color: "var(--text-secondary)" } as const satisfies CSSProperties;
const truncated = { margin: 0, fontSize: 12, color: "var(--warn)" } as const satisfies CSSProperties;

export const s = { root, title, list, truncated };
