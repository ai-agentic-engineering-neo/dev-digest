import type { CSSProperties } from "react";

/** Co-located styles for ReviewRunAccordion (extracted from inline styles). */
export const s = {
  root: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    marginBottom: 14,
    overflow: "hidden",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  // The header is NOT a control any more — only the chevron button toggles the
  // accordion, so a stray click on the agent name / badges does nothing.
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  agentIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  agentName: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  countsText: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  when: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  // Score reads in the verdict's colour so it can't contradict the badge.
  score: (color: string): CSSProperties => ({ fontSize: 14, fontWeight: 700, color }),
  traceBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: 4,
    fontSize: 13,
    fontWeight: 500,
  } satisfies CSSProperties,
  iconBtn: (disabled = false): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    padding: 4,
  }),
  chevron: (open: boolean): CSSProperties => ({
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    color: "var(--text-muted)",
  }),
  spin: { animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
  bannerWrap: { marginBottom: 16 } satisfies CSSProperties,
  // Failed runs have no findings to show — just the error, truncated to one
  // line with the full text in a native title tooltip (mirrors RunHistory).
  errorText: {
    fontSize: 12.5,
    color: "var(--crit)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
