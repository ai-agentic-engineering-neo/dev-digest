import type { CSSProperties } from "react";

export const s = {
  section: { marginBottom: 20 } satisfies CSSProperties,
  dropzone: {
    border: "1px dashed var(--border-strong)",
    borderRadius: 9,
    padding: 24,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  bodyPreview: {
    maxHeight: 220,
    overflow: "auto",
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  badgeRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
