import type { CSSProperties } from "react";

/** Styles for the Preview tab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  card: { padding: "20px 24px", fontSize: 14 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
} as const;
