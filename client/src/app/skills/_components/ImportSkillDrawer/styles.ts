import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  dropZone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    padding: "18px 14px",
    borderRadius: 8,
    border: "1.5px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  notice: {
    marginTop: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  loaded: { color: "var(--ok)", fontWeight: 600 } satisfies CSSProperties,
  ignoredList: {
    margin: "6px 0 0",
    paddingLeft: 18,
    maxHeight: 96,
    overflow: "auto",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  error: {
    marginTop: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
