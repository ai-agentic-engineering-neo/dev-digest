import type { CSSProperties } from "react";

/** Styles for the skill detail pane (header, tabs, body). */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  headerRight: { marginLeft: "auto" } satisfies CSSProperties,
  tabsBar: { marginTop: 14, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  notFound: { display: "flex", flexDirection: "column", alignItems: "center" } satisfies CSSProperties,
  backLink: { color: "var(--accent-text)", fontSize: 14, marginTop: -40 } satisfies CSSProperties,
} as const;
