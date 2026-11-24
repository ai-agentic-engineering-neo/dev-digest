import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } satisfies CSSProperties,
  saved: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 12,
  } satisfies CSSProperties,
} as const;
