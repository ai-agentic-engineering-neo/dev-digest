import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  fileName: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 16px" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", margin: "8px 0 16px" } satisfies CSSProperties,
  trustWarning: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  previewHeading: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 14,
  } satisfies CSSProperties,
  ignoredList: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  warning: {
    fontSize: 12.5,
    color: "var(--warn)",
    marginBottom: 8,
  } satisfies CSSProperties,
} as const;
