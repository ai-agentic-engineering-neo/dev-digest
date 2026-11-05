import type { CSSProperties } from "react";

export const s = {
  body: { padding: "4px 0" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  bodyTabs: { display: "flex", gap: 4 } satisfies CSSProperties,
  bodyTab: (active: boolean): CSSProperties => ({
    fontSize: 12,
    padding: "2px 10px",
    borderRadius: 6,
    border: "1px solid " + (active ? "var(--border-strong)" : "transparent"),
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    cursor: "pointer",
  }),
  preview: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    minHeight: 200,
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
