import type { CSSProperties } from "react";

export const s = {
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  banner: (color: string, bg: string) =>
    ({
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "10px 14px",
      borderRadius: 8,
      background: bg,
      color,
      fontSize: 13,
      marginBottom: 14,
    }) satisfies CSSProperties,
  headRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  levelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  levelLabel: (color: string) =>
    ({
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.4,
      color,
    }) satisfies CSSProperties,
  provenance: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 18,
  } satisfies CSSProperties,
  block: {
    marginBottom: 18,
  } satisfies CSSProperties,
  blockLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  prose: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  riskCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  riskHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  sevDot: (color: string) =>
    ({
      width: 8,
      height: 8,
      borderRadius: 99,
      background: color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  sevLabel: (color: string) =>
    ({
      fontSize: 11,
      fontWeight: 700,
      color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  kindLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  riskTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chevron: (open: boolean) =>
    ({
      flexShrink: 0,
      transform: open ? "rotate(180deg)" : "none",
      transition: "transform 0.15s ease",
      color: "var(--text-muted)",
    }) satisfies CSSProperties,
  riskBody: {
    padding: "0 12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  refRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  } satisfies CSSProperties,
  focusList: {
    listStyle: "decimal",
    margin: 0,
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  focusItem: {
    fontSize: 13.5,
  } satisfies CSSProperties,
  focusButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    font: "inherit",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  focusReason: {
    color: "var(--text-secondary)",
    marginLeft: 6,
  } satisfies CSSProperties,
} as const;
