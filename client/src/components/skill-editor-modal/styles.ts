import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  banner: {
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  serverError: {
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
