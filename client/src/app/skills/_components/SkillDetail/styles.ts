import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, height: "100%" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, padding: "20px 28px 0" } satisfies CSSProperties,
  name: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: "24px 28px 44px" } satisfies CSSProperties,
  tile: (color: string, tint: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    color,
    background: tint,
    flexShrink: 0,
  }),
} as const;
