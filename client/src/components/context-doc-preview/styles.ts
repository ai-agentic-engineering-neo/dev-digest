import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  pathLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  meta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 } satisfies CSSProperties,
  metaText: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  action: { flexShrink: 0 } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-primary)", minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
