import type { CSSProperties } from "react";

/** Styles for the skill Config tab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 } satisfies CSSProperties,
  danger: {
    marginTop: 28,
    paddingTop: 18,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
