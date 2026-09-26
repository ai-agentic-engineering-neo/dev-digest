import type { CSSProperties } from "react";

/** Co-located styles for the conventions CreateSkillModal. */
export const s = {
  banner: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 12,
  } satisfies CSSProperties,
  existing: { marginTop: 6, color: "var(--warn)" } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)", height: 34 } satisfies CSSProperties,
  bodyMeta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  footerNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
