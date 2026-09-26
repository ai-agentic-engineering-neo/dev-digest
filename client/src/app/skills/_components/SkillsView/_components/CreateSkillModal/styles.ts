import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. The Modal leaves body padding to the caller. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
