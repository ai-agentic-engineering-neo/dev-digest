import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    width: 240,
    padding: "7px 10px",
    fontSize: 13,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  row: (attached: boolean, over: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    marginBottom: 8,
    borderRadius: 8,
    border: "1px solid " + (over ? "var(--accent)" : "var(--border)"),
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  grip: (enabled: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
    opacity: enabled ? 1 : 0.3,
    flexShrink: 0,
  }),
  name: { fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
