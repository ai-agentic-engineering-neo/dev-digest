import type { CSSProperties } from "react";
import { INDENT_PX } from "./constants";

const rowBase = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  textAlign: "left",
  padding: "4px 8px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  color: "var(--text-primary)",
} satisfies CSSProperties;

export const s = {
  nav: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 } satisfies CSSProperties,
  header: (selected: boolean): CSSProperties => ({
    ...rowBase,
    gap: 6,
    padding: "6px 8px",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.02em",
    background: selected ? "var(--accent-bg)" : "transparent",
    color: "var(--text-secondary)",
  }),
  folder: (selected: boolean, depth: number): CSSProperties => ({
    ...rowBase,
    gap: 6,
    paddingLeft: 8 + depth * INDENT_PX,
    fontSize: 13,
    background: selected ? "var(--accent-bg)" : "transparent",
  }),
  doc: (selected: boolean, depth: number): CSSProperties => ({
    ...rowBase,
    justifyContent: "space-between",
    gap: 8,
    paddingLeft: 8 + depth * INDENT_PX,
    fontSize: 13,
    background: selected ? "var(--accent-bg)" : "transparent",
  }),
  caret: { width: 10, flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } satisfies CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
