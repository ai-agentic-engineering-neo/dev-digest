import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
} as const;
