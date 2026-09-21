import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterPills. */
export const s = {
  group: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  pill: (on: boolean, color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    color: on ? color : "var(--text-secondary)",
    background: on ? bg : "transparent",
    border: `1px solid ${on ? color : "var(--border)"}`,
    transition: "background .1s, border-color .1s, color .1s",
  }),
} as const;
