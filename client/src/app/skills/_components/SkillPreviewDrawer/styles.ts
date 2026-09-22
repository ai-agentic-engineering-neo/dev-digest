import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewDrawer. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "space-between" } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
  body: {
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
    marginBottom: 22,
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agents: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 } satisfies CSSProperties,
  agent: (enabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: enabled ? "var(--text-primary)" : "var(--text-muted)",
  }),
} as const;
