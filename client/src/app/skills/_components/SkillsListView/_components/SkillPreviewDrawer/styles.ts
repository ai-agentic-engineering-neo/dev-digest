import type { CSSProperties } from "react";

export const s = {
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  description: { fontSize: 14, lineHeight: 1.5, color: "var(--text-primary)", marginBottom: 20 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
    marginBottom: 20,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  body: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px 16px",
    background: "var(--bg-elevated)",
    fontSize: 13,
  } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
