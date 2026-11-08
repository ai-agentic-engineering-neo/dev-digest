import type { CSSProperties } from "react";

export const s = {
  /** Same frame as IntentCard (s.wrap) so the two Overview columns match. */
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "18px 20px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  summary: { fontSize: 12.5, lineHeight: 1.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  tree: { display: "flex", flexDirection: "column", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  note: { fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
