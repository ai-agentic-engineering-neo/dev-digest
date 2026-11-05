import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  chip: {
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "-8px 0 16px" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: "-8px 0 14px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
