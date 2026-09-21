import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 20,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
