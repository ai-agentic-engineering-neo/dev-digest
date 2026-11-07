import type { CSSProperties } from "react";

/** Co-located styles for GroupHeader — CSS variables only. */
export const s = {
  root: (stickyTop: number): CSSProperties => ({
    position: "sticky",
    top: stickyTop,
    zIndex: 4,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: "var(--bg-primary)",
    borderBottom: "1px solid var(--border)",
  }),
  marker: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }),
  title: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  findingFiles: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  files: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
