import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    textAlign: "left",
  } satisfies CSSProperties,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  titleRow: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  agentModel: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  error: {
    fontSize: 12,
    color: "var(--crit)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findingsRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  trailingCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  deleteBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    color: "var(--text-muted)",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
};

export function agentNameButtonStyle(clickable: boolean): CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    color: "var(--text-primary)",
    cursor: clickable ? "pointer" : "default",
    textDecoration: clickable ? "underline" : "none",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  };
}
