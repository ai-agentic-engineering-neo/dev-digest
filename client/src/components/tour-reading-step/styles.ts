import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14, alignItems: "flex-start" } satisfies CSSProperties,
  badge: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    flexShrink: 0,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 13,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
  text: { minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  path: { fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
  why: { marginTop: 4, fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
};
