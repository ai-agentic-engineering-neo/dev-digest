import type { CSSProperties } from "react";

/** Co-located styles for SkillVersionsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 650 } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    listStyle: "none",
    padding: 0,
    margin: 0,
  } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  }),
  rowHead: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  versionTag: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  rowActions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  diffWrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-base)",
  } satisfies CSSProperties,
  diffHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  diffStat: (color: string): CSSProperties => ({ fontSize: 11.5, color }),
  diffBody: { maxHeight: 420, overflow: "auto", padding: "6px 0" } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "1px 12px",
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      kind === "add"
        ? "color-mix(in srgb, var(--ok) 14%, transparent)"
        : kind === "del"
          ? "color-mix(in srgb, var(--crit) 14%, transparent)"
          : "transparent",
  }),
  gutter: {
    flexShrink: 0,
    width: 54,
    textAlign: "right",
    color: "var(--text-muted)",
    opacity: 0.8,
    userSelect: "none",
  } satisfies CSSProperties,
  sign: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    flexShrink: 0,
    width: 10,
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-muted)",
    userSelect: "none",
  }),
  identical: { padding: "12px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
