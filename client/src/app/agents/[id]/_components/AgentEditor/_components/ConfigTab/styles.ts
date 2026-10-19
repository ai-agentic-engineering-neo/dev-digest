import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
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
  tokens: (over: boolean): CSSProperties => ({ fontSize: 12, color: over ? "var(--warn)" : "var(--text-muted)" }),
  advancedToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    marginBottom: 16,
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  advanced: {
    padding: "16px 18px 0",
    marginBottom: 20,
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
