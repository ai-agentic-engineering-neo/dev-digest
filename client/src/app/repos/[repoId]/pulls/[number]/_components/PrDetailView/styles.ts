import type { CSSProperties } from "react";

/** Centered content column shared by the loading state and the tab body. */
const column: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  maxWidth: 1080,
  margin: "0 auto",
};

export const s = {
  skeleton: { ...column, padding: "28px 32px", gap: 16 } satisfies CSSProperties,
  body: { ...column, padding: "24px 32px 44px", gap: 24 } satisfies CSSProperties,
};
