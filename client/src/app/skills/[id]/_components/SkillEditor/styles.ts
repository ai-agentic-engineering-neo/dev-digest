import type { CSSProperties } from "react";

/** Co-located styles for the SkillEditor page. */
export const s = {
  page: { display: "flex", flexDirection: "column", height: "calc(100vh - 52px)", minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 28px 0", flexShrink: 0, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { marginTop: 14, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  markdown: { fontSize: 13.5, lineHeight: 1.6, padding: 18, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
  versionList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  versionRow: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-surface)", padding: "10px 12px" } satisfies CSSProperties,
  versionHead: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  versionDate: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  versionSpacer: { flex: 1 } satisfies CSSProperties,
  diffBox: { marginTop: 10, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  diffSummary: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
