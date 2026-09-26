import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  fileName: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  trust: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "8px 10px",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  error: {
    fontSize: 12.5,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 8,
    padding: "8px 10px",
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  sourceFile: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
