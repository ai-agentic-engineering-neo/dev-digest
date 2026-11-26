import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  usedBy: { fontSize: 13, color: "var(--text-muted)", marginLeft: 6 } satisfies CSSProperties,
  danger: {
    marginTop: 36,
    border: "1px solid var(--crit)",
    borderRadius: 10,
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } satisfies CSSProperties,
  dangerText: { flex: 1 } satisfies CSSProperties,
  dangerTitle: { fontSize: 14, fontWeight: 700, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.45 } satisfies CSSProperties,
} as const;
