import type { CSSProperties } from "react";

/** Co-located styles for SmartOrderView. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  banner: {
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 8,
    padding: "12px 16px",
  } satisfies CSSProperties,
  bannerTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  bannerBody: { fontSize: 12, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
} as const;
