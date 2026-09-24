import type { CSSProperties } from "react";

/** Co-located styles for SkillWorkspace (editor pane, as in AgentEditorView). */
export const s = {
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 14px", flexShrink: 0 } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  editorScroll: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
} as const;
