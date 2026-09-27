import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionsSkillModal. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" } satisfies CSSProperties,
  footerNote: {
    marginRight: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  error: {
    padding: "10px 12px",
    marginBottom: 12,
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
