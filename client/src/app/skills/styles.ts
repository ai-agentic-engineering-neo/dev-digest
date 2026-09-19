import type { CSSProperties } from "react";

/** Shared page-shell styles for /skills/[id] (rail + tabbed editor). The
 * top-level /skills list uses its own SkillsListView styles instead. */
export const s = {
  shell: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  loadingPane: {
    flex: 1,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
} as const;
