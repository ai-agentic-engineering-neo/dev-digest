import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionSkillModal. */
export const s = {
  body: { padding: "20px 24px 8px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    marginBottom: 20,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent-text)", flexShrink: 0 } satisfies CSSProperties,
  strong: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  error: { margin: "-8px 0 16px", fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agents: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
