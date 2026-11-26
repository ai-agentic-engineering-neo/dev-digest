import type { CSSProperties } from "react";

/** Co-located styles for MergeConflictsDialog. */
export const s = {
  // Modal renders children unpadded; 24px sides line up with its header and footer.
  body: { padding: "20px 24px" } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  sides: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } satisfies CSSProperties,
  side: { minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  sideLabel: { fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  code: {
    margin: 0,
    padding: "8px 10px",
    maxHeight: 200,
    overflow: "auto",
    borderRadius: 6,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  choices: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
