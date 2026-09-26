import type { CSSProperties } from "react";

/** Co-located styles for the /skills master-detail shell. Mirrors the Agent
   Editor's left-list + right-pane layout (AgentEditorView). */
export const s = {
  wrap: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  leftPane: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  leftHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 16px 12px",
  } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 16px 12px",
    padding: "8px 10px",
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
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  rightPane: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto" } satisfies CSSProperties,
  detailLoading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  newPane: { padding: 28, flex: 1, overflow: "auto" } satisfies CSSProperties,
} as const;
