import type { CSSProperties } from "react";

/** Co-located styles for SettingsAbout. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  versionRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 24,
    fontSize: 14,
  } satisfies CSSProperties,
  versionLabel: { fontWeight: 600 } satisfies CSSProperties,
  versionValue: { marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  sectionLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  table: { display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  rowFirst: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    fontSize: 13,
  } satisfies CSSProperties,
  feature: { fontWeight: 600 } satisfies CSSProperties,
  model: {
    marginLeft: "auto",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
  } satisfies CSSProperties,
  defaultTag: { fontSize: 11, fontWeight: 500, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
