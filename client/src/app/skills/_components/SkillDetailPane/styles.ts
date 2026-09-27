import type { CSSProperties } from "react";

/** Co-located styles for SkillDetailPane. */
export const s = {
  placeholder: { flex: 1, display: "grid", placeItems: "center" } satisfies CSSProperties,
  loading: { padding: 28 } satisfies CSSProperties,
} as const;
