import type { CSSProperties } from "react";

const banner: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 16,
};

/** Co-located styles for ConventionsView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  errorBanner: {
    ...banner,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
  } satisfies CSSProperties,
  infoBanner: {
    ...banner,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  filters: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  selection: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  selectionCount: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  noneInFilter: { fontSize: 13, color: "var(--text-muted)", padding: "12px 4px" } satisfies CSSProperties,
} as const;
