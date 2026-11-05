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
  row: (linked: boolean, dragOver: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (dragOver ? "var(--accent)" : "var(--border)"),
    background: linked ? "var(--bg-elevated)" : "var(--bg-surface)",
  }),
  handle: (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    width: 14,
    flexShrink: 0,
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
  }),
  toggle: { display: "inline-flex", flexShrink: 0 } satisfies CSSProperties,
  nameBlock: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  name: (linked: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: linked ? 600 : 500,
    color: linked ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  muted: { opacity: 0.55 } satisfies CSSProperties,
  arrows: { display: "flex", gap: 2 } satisfies CSSProperties,
  arrowBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
  } satisfies CSSProperties,
  /** "#1" column — fixed width so type badges line up whether linked or not. */
  position: { width: 26, textAlign: "right", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13 } satisfies CSSProperties,
} as const;
