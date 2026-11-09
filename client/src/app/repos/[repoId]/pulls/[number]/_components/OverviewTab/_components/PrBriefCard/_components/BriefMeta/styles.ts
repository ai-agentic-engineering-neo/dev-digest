import type { CSSProperties } from "react";

const root = { margin: 0, fontSize: 12, color: "var(--text-muted)" } as const satisfies CSSProperties;

export const s = { root };
