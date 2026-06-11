import type { CSSProperties } from "react";

/** Co-located styles for SettingsWorkspace. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  toggleCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 18px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 20,
  } satisfies CSSProperties,
  toggleTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  toggleSub: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
