import type { CSSProperties } from "react";

export const s = {
  card: { position: "relative", padding: 0 } satisfies CSSProperties,
  // Card sets the `border` shorthand; override with the shorthand too (React warns when a
  // re-render mixes `border` with `borderColor` on the same element).
  active: { border: "1px solid var(--accent)", background: "var(--bg-hover)" } satisfies CSSProperties,
  open: { all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, padding: 14, width: "100%", boxSizing: "border-box" } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 10, paddingRight: 52 } satisfies CSSProperties,
  tile: (color: string, tint: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 6,
    color,
    background: tint,
    flexShrink: 0,
  }),
  name: { minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  desc: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  source: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 12, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  accept: { color: "var(--ok)", fontWeight: 600 } satisfies CSSProperties,
  toggle: { position: "absolute", top: 14, right: 14, display: "inline-flex" } satisfies CSSProperties,
} as const;
