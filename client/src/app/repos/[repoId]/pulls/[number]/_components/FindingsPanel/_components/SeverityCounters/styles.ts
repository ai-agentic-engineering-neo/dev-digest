import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounters. */
export const s = {
  group: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  separator: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
