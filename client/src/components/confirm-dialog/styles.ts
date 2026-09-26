import type { CSSProperties } from "react";

export const s = {
  body: {
    margin: 0,
    padding: "18px 24px",
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    whiteSpace: "pre-line", // i18n messages use \n for paragraph breaks
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
};
