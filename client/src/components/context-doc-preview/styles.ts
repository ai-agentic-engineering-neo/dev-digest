import type { CSSProperties } from "react";

/** Co-located styles for ContextDocPreview. The Modal leaves body padding to the caller. */
export const s = {
  body: { padding: "18px 24px 24px", maxHeight: "60vh", overflow: "auto", fontSize: 13.5, lineHeight: 1.55 } satisfies CSSProperties,
  subtitle: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
