import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  versionChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    padding: "2px 8px",
    borderRadius: 5,
  } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 8 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
