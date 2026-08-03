import type React from "react";

/* Hoisted out of JSX — inline literals are re-created every render. */
export const s = {
  loadingStack: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1080,
    margin: "0 auto",
  },
  body: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1080,
    margin: "0 auto",
  },
} satisfies Record<string, React.CSSProperties>;
