import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  panel: {} satisfies CSSProperties,
  header: { marginBottom: 14 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { margin: "4px 0 0", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  skeletonRow: { padding: "14px 18px" } satisfies CSSProperties,
};
