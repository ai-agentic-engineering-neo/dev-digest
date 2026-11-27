import type { CSSProperties } from "react";

export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" },
  sidebar: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  },
  sidebarHeader: { padding: "16px 16px 12px" },
  sidebarTitleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  sidebarTitle: { fontSize: 18, fontWeight: 700, flex: 1 },
  sidebarList: { flex: 1, overflow: "auto", padding: "0 12px 12px" },
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 },
  editor: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  editorHeader: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 },
  editorIcon: { color: "var(--accent)" },
  editorTitle: { fontSize: 18, fontWeight: 700 },
  editorActions: { marginLeft: "auto" },
  editorBody: { flex: 1, minHeight: 0, overflow: "auto" },
} satisfies Record<string, CSSProperties>;
