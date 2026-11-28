import type { CSSProperties } from "react";

/** Styles for the two-step import modal. */
export const s = {
  body: { padding: "20px 24px 8px" } satisfies CSSProperties,
  fileInput: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  reading: { fontSize: 14, color: "var(--text-secondary)", padding: "12px 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 14 } satisfies CSSProperties,
  source: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  section: { marginBottom: 18 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  fileList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  fileRow: { display: "flex", gap: 12, fontSize: 13 } satisfies CSSProperties,
  filePath: { flex: 1, minWidth: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  fileSize: { color: "var(--text-muted)" } satisfies CSSProperties,
  warning: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
