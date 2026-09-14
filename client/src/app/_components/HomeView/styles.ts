import type React from "react";

/* Hoisted out of JSX: inline object literals are re-created every render and
   defeat memoization on children. */
export const s = {
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxWidth: 480,
  },
  redirectNote: { color: "var(--text-secondary)", marginBottom: 14 },
} satisfies Record<string, React.CSSProperties>;
