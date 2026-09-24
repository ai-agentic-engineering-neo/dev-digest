import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  scanButtons: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  page: { padding: "28px 32px 48px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  failed: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 18,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  failedIcon: { color: "var(--crit)", flexShrink: 0 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)", marginLeft: 6 } satisfies CSSProperties,
  toolbarRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: "12px 0" } satisfies CSSProperties,
} as const;
