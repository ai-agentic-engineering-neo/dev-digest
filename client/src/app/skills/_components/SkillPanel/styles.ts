import type { CSSProperties } from "react";

/** Co-located styles for SkillPanel (the side preview / editor). */
export const s = {
  panel: {
    width: 460,
    flexShrink: 0,
    borderLeft: "1px solid var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 10px" } satisfies CSSProperties,
  name: { flex: 1, fontSize: 15, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, padding: "0 18px 12px", flexWrap: "wrap" } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  markdown: {
    fontSize: 13,
    lineHeight: 1.55,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  notice: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "8px 10px",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
