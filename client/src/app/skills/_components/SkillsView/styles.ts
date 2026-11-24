import type { CSSProperties } from "react";
import { CARD_GRID_COLS, PREVIEW_WIDTH } from "./constants";

/** Co-located styles for SkillsView. */
export const s = {
  split: { display: "flex", alignItems: "flex-start", minHeight: "calc(100vh - 52px)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  noMatch: { fontSize: 14, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
  aside: {
    width: PREVIEW_WIDTH,
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "calc(100vh - 52px)",
    overflow: "auto",
    borderLeft: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
