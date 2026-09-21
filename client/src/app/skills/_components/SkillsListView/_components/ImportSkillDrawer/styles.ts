import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  fileInput: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  importingNote: { fontSize: 13, color: "var(--text-secondary)", marginTop: 12 } satisfies CSSProperties,
  errorNote: { fontSize: 13, color: "var(--crit)", marginTop: 12 } satisfies CSSProperties,
  warnings: {
    marginTop: 4,
    marginBottom: 16,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg, transparent)",
  } satisfies CSSProperties,
  warningsTitle: { fontSize: 12, fontWeight: 700, color: "var(--warn)", marginBottom: 6 } satisfies CSSProperties,
  warningItem: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
