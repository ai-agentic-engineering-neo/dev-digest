import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 96px", maxWidth: 1040 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 16 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  toolbar: { display: "flex", gap: 8, marginTop: 18 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12, marginTop: 14 } satisfies CSSProperties,
} as const;
