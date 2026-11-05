import type { CSSProperties } from "react";
import { COLUMN_MAX_WIDTH } from "./constants";

/** Co-located styles for the agent's Skills tab (matches the Agent Editor · Skills design). */
export const s = {
  /** One bounded column: header, hint, filter and list share the same width on wide screens. */
  column: { maxWidth: COLUMN_MAX_WIDTH, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    marginBottom: 14,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 14,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13 } satisfies CSSProperties,
} as const;
