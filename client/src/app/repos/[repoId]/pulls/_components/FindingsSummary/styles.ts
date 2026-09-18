import type { CSSProperties } from "react";

/** Co-located styles for the PR-list FINDINGS column + hover popover. */
export const s = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "default",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  // Positioned as a fixed-position portal (see FindingsSummary.tsx) so it can
  // escape ancestors with `overflow: hidden` (e.g. the PR-list table card) —
  // `top`/`left` are computed at hover time from the trigger's bounding rect.
  popover: {
    width: 340,
    maxHeight: 360,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 10,
    zIndex: 40,
    animation: "ddpop .12s ease",
    cursor: "default",
  } satisfies CSSProperties,
  popoverTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "2px 4px 8px",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4,
  } satisfies CSSProperties,
  cardDescription: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;
