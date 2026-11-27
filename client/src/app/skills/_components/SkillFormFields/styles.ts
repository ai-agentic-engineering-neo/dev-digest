import type { CSSProperties } from "react";

export const s = {
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  counter: (over: boolean): CSSProperties => ({
    fontSize: 12,
    color: over ? "var(--crit)" : "var(--text-muted)",
  }),
  // Red frame around the editor when the body is flagged (the Textarea has its own border).
  bodyFrame: (flagged: boolean): CSSProperties => ({
    borderRadius: 9,
    padding: flagged ? 2 : 0,
    boxShadow: flagged ? "0 0 0 2px var(--crit)" : "none",
  }),
} as const;
