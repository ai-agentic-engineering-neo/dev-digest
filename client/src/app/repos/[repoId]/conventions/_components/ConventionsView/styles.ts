import type { CSSProperties } from "react";

/** Styles for the Conventions page body. */
export const s = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  repoName: { fontFamily: "var(--font-mono)", color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: "var(--gap)", flexShrink: 0 } satisfies CSSProperties,
  count: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  alert: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--ok)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
