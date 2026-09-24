import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView (the sidebar + pane frame, matching
 *  AgentEditorView, and the loading / error pane). */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  pane: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
