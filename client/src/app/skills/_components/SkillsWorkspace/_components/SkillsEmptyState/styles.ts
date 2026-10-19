import type { CSSProperties } from "react";

export const s = {
  wrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 32,
  } satisfies CSSProperties,
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--accent)",
    marginBottom: 20,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 380, lineHeight: 1.55, margin: "0 0 22px" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
