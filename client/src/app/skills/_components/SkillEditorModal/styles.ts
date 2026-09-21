import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorModal. */
export const s = {
  body: { padding: "20px 24px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  } satisfies CSSProperties,
  error: {
    marginRight: "auto",
    fontSize: 12.5,
    color: "var(--crit)",
    maxWidth: 420,
  } satisfies CSSProperties,
} as const;
