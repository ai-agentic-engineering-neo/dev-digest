import type { CSSProperties } from "react";

export const s = {
  /* Brief card first, Intent + Blast grid, Review focus full-width below. */
  section: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  /* Two columns on wide screens (Intent left, Blast radius right); one when narrow. */
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
