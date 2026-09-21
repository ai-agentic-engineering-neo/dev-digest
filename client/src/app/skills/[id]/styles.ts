import type { CSSProperties } from "react";

/** Co-located styles for the /skills/[id] page shell. */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  headerIcon: { color: "var(--accent)" } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
} as const;
