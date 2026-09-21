import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 240 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "12px 4px" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 18 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  handle: {
    display: "grid",
    placeItems: "center",
    padding: 2,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    touchAction: "none",
  } satisfies CSSProperties,
  name: { fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  disabledNote: { fontSize: 11.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  spacer: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
