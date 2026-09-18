import type { CSSProperties } from "react";

export const s = {
  root: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    marginBottom: 14,
    overflow: "hidden",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "13px 16px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  headerIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  agentName: {
    fontWeight: 600,
    fontSize: 14,
  } satisfies CSSProperties,
  countsText: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  spacer: {
    flex: 1,
  } satisfies CSSProperties,
  when: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    padding: "0 16px 16px",
  } satisfies CSSProperties,
  verdictWrap: {
    marginBottom: 16,
  } satisfies CSSProperties,
};

export function deleteButtonStyle(pending: boolean): CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  };
}

export const spinningIconStyle: CSSProperties = { animation: "ddspin 1s linear infinite" };

export function chevronStyle(open: boolean): CSSProperties {
  return {
    transform: open ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    color: "var(--text-muted)",
  };
}
