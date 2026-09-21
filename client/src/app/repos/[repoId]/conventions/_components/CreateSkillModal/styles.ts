import type { CSSProperties } from "react";

export const s = {
  panel: { padding: "20px 24px" } satisfies CSSProperties,
  intro: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 20,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  twoCol: { display: "flex", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  col: { flex: 1, minWidth: 220 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
};
