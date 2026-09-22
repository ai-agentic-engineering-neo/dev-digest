import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
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
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  danger: {
    marginTop: 36,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--crit)",
  } satisfies CSSProperties,
  dangerRow: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  dangerBody: { flex: 1, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
