import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusTab. */
export const s = {
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 13,
    marginBottom: 14,
  } satisfies CSSProperties,
  noCallers: {
    padding: "16px 4px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  groupCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  groupSymbol: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  callerSymbol: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  factsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  } satisfies CSSProperties,
} as const;
