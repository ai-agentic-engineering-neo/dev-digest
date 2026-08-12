import type { CSSProperties } from "react";

/** Co-located styles for the Project Context page — mirrors the Pull
 *  Requests list's page-header shape, plus a two-pane list/preview split
 *  (mirrors SkillsView's rail/editor split). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,

  rootsPanel: {
    margin: "0 32px 14px",
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  rootsHint: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  rootsTextarea: {
    width: "100%",
    minHeight: 80,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontFamily: "var(--font-mono, monospace)",
    resize: "vertical",
  } satisfies CSSProperties,
  rootsActions: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,

  loadingStack: { display: "flex", flexDirection: "column", gap: 12, margin: "14px 32px 44px" } satisfies CSSProperties,

  split: { display: "flex", gap: 0, margin: "14px 32px 44px", minHeight: 480 } satisfies CSSProperties,
  list: {
    width: 340,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingRight: 16,
    overflow: "auto",
  } satisfies CSSProperties,
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--accent-bg)" : "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  }),
  rowTop: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  rowPath: { fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  rowMeta: { fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 10 } satisfies CSSProperties,

  previewPane: { flex: 1, minWidth: 0, paddingLeft: 24, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  previewEmpty: { flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  previewHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  previewPath: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  previewContent: {
    flex: 1,
    overflow: "auto",
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
