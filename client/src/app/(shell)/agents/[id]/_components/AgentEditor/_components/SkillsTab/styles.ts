import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 220 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  order: { display: "flex", flexDirection: "column", width: 22 } satisfies CSSProperties,
  name: { fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  spacer: { width: 22 } satisfies CSSProperties,
} as const;

/** Row background/opacity depends on attachment; not a static entry above
    because it varies per-row. */
export function row(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 8,
    background: active ? "var(--bg-hover)" : "transparent",
    opacity: active ? 1 : 0.7,
  };
}

export function typeChip(color: string): CSSProperties {
  return { color, background: color + "22" };
}

/** Wraps a move-up/move-down IconBtn: the kit's IconBtn has no `disabled`
    prop, so the boundary row (first ↑ / last ↓) is disabled here instead. */
export function orderBtnWrap(disabled: boolean): CSSProperties {
  return { opacity: disabled ? 0.3 : 1, pointerEvents: disabled ? "none" : "auto" };
}
