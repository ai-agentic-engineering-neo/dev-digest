import type { CSSProperties } from "react";

/** Co-located styles for SkillsView (two-pane shape, mirrors AgentEditorView
    plus the AgentsListView search box). 52px is the Topbar height. */
export const s = {
  container: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  sidebarHeader: { padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  sidebarHeaderTop: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  sidebarTitle: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  sidebarList: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  skeletonCard: { marginBottom: 10, borderRadius: 8 } satisfies CSSProperties,
  rightPane: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  emptyWrapper: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" } satisfies CSSProperties,
  editorSkeletonContainer: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  editorWrapper: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  editorHeader: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  editorHeaderIcon: { color: "var(--accent)" } satisfies CSSProperties,
  editorTitle: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  editorContent: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
} as const;
