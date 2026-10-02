import type React from "react";

/* Hoisted out of JSX — inline literals are re-created every render. */
/* No maxWidth here (unlike PageShell's sitewide 1200 for list-style pages) —
   the PR detail page's figma is a full-bleed data-dense layout: the Overview
   grid, Agent-runs timeline, and Files-changed diff all use whatever width
   the viewport gives them, just bounded by this padding. */
export const s = {
  loadingStack: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  body: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
} satisfies Record<string, React.CSSProperties>;
