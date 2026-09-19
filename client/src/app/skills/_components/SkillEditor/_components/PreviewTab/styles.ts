import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  // Same weight as the Config and Versions headers, so the tabs read as one screen.
  header: { fontSize: 15, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 20,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  body: {
    padding: 24,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
