import type { CSSProperties } from "react";

/** Co-located styles for the SkillEditor shell. */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  tabsBar: { marginTop: 12 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: "24px 24px 32px" } satisfies CSSProperties,
} as const;
