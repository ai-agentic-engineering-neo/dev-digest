import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  loaded: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    padding: "8px 12px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  loadedLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  importNote: { margin: "4px 0 0", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
