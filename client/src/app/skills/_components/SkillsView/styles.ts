import type { CSSProperties } from "react";

/* Hoisted out of JSX — inline literals are re-created on every render.
   Two-pane shape, mirroring AgentEditorView. */
export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" },
  rail: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  },
  railHead: { padding: "16px 16px 12px" },
  railTitleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  railTitle: { fontSize: 18, fontWeight: 700, flex: 1 },
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  },
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  },
  railList: { flex: 1, overflow: "auto", padding: "0 12px 12px" },
  railSkeleton: { display: "flex", flexDirection: "column", gap: 10, padding: "0 12px" },

  editorPane: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  editorSkeleton: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 },
  editorHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  },
  editorIcon: { color: "var(--accent)", flexShrink: 0 },
  editorTitle: { fontSize: 18, fontWeight: 700 },
  headSpacer: { marginLeft: "auto" },
  editorBody: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  placeholder: { flex: 1, display: "grid", placeItems: "center" },
} satisfies Record<string, CSSProperties>;
