import type { CSSProperties } from "react";

export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
