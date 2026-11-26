import type { CSSProperties } from "react";

/** Co-located styles for EditConventionModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  evidenceList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  evidenceRow: (removed: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    opacity: removed ? 0.5 : 1,
    textDecoration: removed ? "line-through" : "none",
  }),
  evidencePath: { flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 12.5 } satisfies CSSProperties,
} as const;
