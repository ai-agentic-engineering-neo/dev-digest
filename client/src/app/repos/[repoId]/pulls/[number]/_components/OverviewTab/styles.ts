import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
    marginBottom: 24,
  } satisfies CSSProperties,
  intentSignals: {
    marginTop: 10,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  intentEmpty: {
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: 18,
    fontSize: 13,
    color: "var(--text-muted)",
    marginBottom: 24,
  } satisfies CSSProperties,
} as const;
