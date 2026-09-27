import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: {
    padding: "28px 32px 48px",
    maxWidth: 1080,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 18 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)", marginRight: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  alert: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  alertText: { flex: 1 } satisfies CSSProperties,
} as const;
