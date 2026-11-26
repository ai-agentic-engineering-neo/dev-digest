import type { CSSProperties } from "react";

/** Co-located styles for AgentSuggestionsDialog. */
export const s = {
  // Modal renders children unpadded; 24px sides line up with its header and footer.
  body: { padding: "20px 24px" } satisfies CSSProperties,
  note: {
    margin: "0 0 12px",
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  score: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  reasons: { margin: 0, padding: 0, listStyle: "none", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  side: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  failed: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
};
