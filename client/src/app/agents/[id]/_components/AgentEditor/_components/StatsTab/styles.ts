import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 } satisfies CSSProperties,
  header: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  acceptTile: {
    flex: 1,
    minWidth: 190,
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
  } satisfies CSSProperties,
  acceptText: { minWidth: 0 } satisfies CSSProperties,
  tileLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  tileValue: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 8 } satisfies CSSProperties,
  lowSampleNote: { fontSize: 11, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  provenanceLine: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  findingsRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 14,
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
  } satisfies CSSProperties,
  findingsLabel: { color: "var(--text-muted)", fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  pendingNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
