import type { CSSProperties } from "react";

/** Co-located styles for AgentEditorView (agent list sidebar + editor pane). */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  sidebarHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  sidebarTitleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  sidebarTitle: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  sidebarList: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  mainHeader: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  mainIcon: { color: "var(--accent)" } satisfies CSSProperties,
  mainTitle: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  mainActions: { marginLeft: "auto" } satisfies CSSProperties,
  editorScroll: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
};
