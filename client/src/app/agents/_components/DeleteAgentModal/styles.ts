import type { CSSProperties } from "react";

/** Co-located styles for DeleteAgentModal (mirrors the skills delete modal). */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 12, fontSize: 14 } satisfies CSSProperties,
} as const;
