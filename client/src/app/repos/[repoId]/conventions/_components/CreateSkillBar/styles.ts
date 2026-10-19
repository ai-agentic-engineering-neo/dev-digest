import type { CSSProperties } from "react";

export const s = {
  bar: {
    position: "sticky",
    bottom: 16,
    marginTop: 20,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px 12px 20px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
  } satisfies CSSProperties,
  count: { flex: 1, fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
