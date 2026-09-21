import type { CSSProperties } from "react";

/** Co-located styles for InjectionBanner. */
export const s = {
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 14,
    padding: "12px 24px",
    background: "var(--crit-bg)",
    borderTop: "1px solid var(--crit)",
    borderBottom: "1px solid var(--crit)",
    color: "var(--crit)",
  } satisfies CSSProperties,
  icon: { flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.45 } satisfies CSSProperties,
} as const;
