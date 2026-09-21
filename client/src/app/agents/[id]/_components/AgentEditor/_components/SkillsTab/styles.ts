import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 240 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  group: { marginBottom: 20 } satisfies CSSProperties,
  groupTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  groupEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "12px 4px" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 18 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  /** One skill row. `flagged` = injection detected (red outline); `dimmed` = globally disabled skill. */
  row: ({ flagged, dimmed }: { flagged: boolean; dimmed: boolean }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${flagged ? "var(--crit)" : "var(--border)"}`,
    background: flagged ? "var(--crit-bg)" : "var(--bg-elevated)",
    opacity: dimmed ? 0.55 : 1,
  }),
  handle: {
    display: "grid",
    placeItems: "center",
    padding: 2,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    touchAction: "none",
  } satisfies CSSProperties,
  toggleLabel: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" } satisfies CSSProperties,
  name: { fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  disabledNote: { fontSize: 11.5, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  trailing: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
