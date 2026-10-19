import type { CSSProperties } from "react";

/** Styles for the /skills/:id editor pane. */
export const s = {
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 24px 0", flexShrink: 0 } satisfies CSSProperties,
  iconBox: (color: string): CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: 7,
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  h1: { fontSize: 17, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  versionChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    padding: "2px 8px",
    borderRadius: 5,
  } satisfies CSSProperties,
  headerRight: { marginLeft: "auto" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" } satisfies CSSProperties,
} as const;
