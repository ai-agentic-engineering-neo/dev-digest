import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  body: {
    padding: "18px 24px 22px",
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  error: {
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
