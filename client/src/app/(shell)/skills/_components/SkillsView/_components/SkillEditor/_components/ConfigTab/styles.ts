import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
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
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  dangerZone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 32,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  dangerTitle: { fontSize: 13, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;
