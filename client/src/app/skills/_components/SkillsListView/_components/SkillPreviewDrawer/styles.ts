import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewDrawer. */
export const s = {
  badgeRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
