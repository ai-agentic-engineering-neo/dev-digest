import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  importedBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--accent)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 20,
  } satisfies CSSProperties,
  evidenceList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
