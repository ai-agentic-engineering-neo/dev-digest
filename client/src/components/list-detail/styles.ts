import type { CSSProperties } from "react";

/** Co-located styles for ListDetail (CSS variables only). */
export const s = {
  /** Full height under the 52px topbar of AppFrame. */
  root: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  listBody: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  detail: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
} as const;
