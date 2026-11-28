import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilter. Colours come from the SEV tokens. */
export const s = {
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  /** One counter pill. Active = filled with its severity colour; the rest dim. */
  counter: (
    color: string,
    state: { active: boolean; dimmed: boolean; disabled: boolean },
  ): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    border: `1px solid ${color}`,
    background: state.active ? color : "transparent",
    color: state.active ? "var(--bg-primary)" : color,
    opacity: state.dimmed ? 0.45 : 1,
    cursor: state.disabled ? "default" : "pointer",
    transition: "background .12s, color .12s, opacity .12s",
  }),
} as const;
