import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", minHeight: 0, height: "100%" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, padding: "18px 28px 12px" } satisfies CSSProperties,
  iconBox: (imported: boolean): CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    background: imported ? "var(--crit-bg)" : "var(--accent-bg)",
    color: imported ? "var(--crit)" : "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  name: { fontSize: 20, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  chip: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: "22px 28px 28px" } satisfies CSSProperties,
} as const;
