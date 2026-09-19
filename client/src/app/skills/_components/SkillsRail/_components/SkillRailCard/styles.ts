import type { CSSProperties } from "react";

export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 12,
    borderRadius: 9,
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
