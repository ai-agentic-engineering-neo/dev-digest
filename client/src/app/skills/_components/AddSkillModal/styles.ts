import type { CSSProperties } from "react";

/** Co-located styles for AddSkillModal and its tabs' shared form chrome. */
export const s = {
  /** Pill-style tab row, as in the design (active tab = accent-tinted pill). */
  tabsBar: {
    display: "flex",
    gap: 6,
    padding: "12px 24px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tab: (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    transition: "background .12s, color .12s",
  }),
  panel: { padding: "20px 24px 24px" } satisfies CSSProperties,
} as const;
