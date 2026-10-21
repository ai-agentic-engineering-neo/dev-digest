import type { CSSProperties } from "react";

/* Layout mirrors VerdictBanner (icon tile · title row + summary · score column)
   with a right column that also holds the regenerate icon and the cost line. */
export const s = {
  wrap: { display: "flex", gap: 18, alignItems: "flex-start" } satisfies CSSProperties,
  iconBox: (bg: string, color: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  label: (color: string): CSSProperties => ({ fontSize: 18, fontWeight: 700, color }),
  summary: { margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  side: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
  } satisfies CSSProperties,
  scoreLabel: { fontSize: 11, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  cost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  costBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 11,
    color: "var(--text-muted)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  error: { margin: "10px 0 0", fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  center: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 4px" } satisfies CSSProperties,
} as const;
