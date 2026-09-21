import type { CSSProperties } from "react";

/** Co-located styles for VersionDiff. */
const ROW_BASE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 44px 20px 1fr",
  fontSize: 12.5,
  lineHeight: 1.6,
};

const LINE_COLORS = {
  add: { bg: "var(--ok-bg)", fg: "var(--ok)" },
  del: { bg: "var(--crit-bg)", fg: "var(--crit)" },
  same: { bg: "transparent", fg: "var(--text-secondary)" },
} as const;

export const s = {
  summary: { display: "flex", gap: 12, fontSize: 12, marginBottom: 10, color: "var(--text-muted)" } satisfies CSSProperties,
  added: { color: "var(--ok)", fontWeight: 600 } satisfies CSSProperties,
  removed: { color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  table: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "auto",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  row: (type: keyof typeof LINE_COLORS): CSSProperties => ({
    ...ROW_BASE,
    background: LINE_COLORS[type].bg,
    color: LINE_COLORS[type].fg,
  }),
  gutter: {
    textAlign: "right",
    padding: "0 8px",
    color: "var(--text-muted)",
    userSelect: "none",
    opacity: 0.8,
  } satisfies CSSProperties,
  sign: { textAlign: "center", userSelect: "none", fontWeight: 700 } satisfies CSSProperties,
  text: { whiteSpace: "pre-wrap", wordBreak: "break-word", paddingRight: 12 } satisfies CSSProperties,
  gap: {
    padding: "3px 12px",
    fontSize: 12,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    textAlign: "center",
  } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
