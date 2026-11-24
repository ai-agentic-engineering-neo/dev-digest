import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 880, margin: "0 auto", padding: "32px 24px 64px" } satisfies CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 650, margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-muted)", margin: "6px 0 0" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  note: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    margin: "0 0 14px",
  } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 8,
    padding: "10px 12px",
    margin: "0 0 14px",
  } satisfies CSSProperties,
} as const;
