import type { CSSProperties } from "react";

/** Co-located styles for the multi-agent results surface (Screens C/D). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  layoutToggle: {
    display: "flex",
    gap: 2,
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    padding: 2,
  } satisfies CSSProperties,
  layoutToggleBtn: (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 5,
    border: "none",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  scoreLegend: {
    padding: "0 32px",
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 12,
  } satisfies CSSProperties,
  banner: (crit: boolean): CSSProperties => ({
    margin: "0 32px 16px",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    background: crit ? "var(--crit-bg)" : "var(--warn-bg)",
    color: crit ? "var(--crit)" : "var(--warn)",
  }),
  loadingStack: {
    padding: 32,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  body: {
    padding: "0 32px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  } satisfies CSSProperties,
};
