import type { CSSProperties } from "react";

/** Styles for the /agents/:id editor pane. */
export const s = {
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "20px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  headerIcon: { color: "var(--accent)" } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  headerRight: { marginLeft: "auto" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" } satisfies CSSProperties,
} as const;
