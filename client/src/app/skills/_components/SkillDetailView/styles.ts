import type { CSSProperties } from "react";

/** Co-located styles for SkillDetailView. */
export const s = {
  // Fixed-height column: SkillDetail's header + tabs stay put, only its body scrolls.
  page: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 52px)",
    maxWidth: 1100,
    margin: "0 auto",
  } satisfies CSSProperties,
  back: {
    alignSelf: "flex-start",
    padding: "20px 28px 0",
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;
