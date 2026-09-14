import type { CSSProperties } from "react";

/** Co-located styles for the skill Config tab. Mirrors the agent ConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } satisfies CSSProperties,
  savedNote: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
