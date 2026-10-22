import type { CSSProperties } from "react";

export const s = {
  body: { padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 12,
    borderRadius: 10,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent-text)", flexShrink: 0 } satisfies CSSProperties,
  bannerRepo: { color: "var(--accent-text)" } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 12, margin: "4px 0 14px" } satisfies CSSProperties,
  enabledText: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  enabledHint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: {
    marginRight: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
