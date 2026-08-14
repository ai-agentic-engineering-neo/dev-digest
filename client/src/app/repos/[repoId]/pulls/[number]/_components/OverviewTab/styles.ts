import type { CSSProperties } from "react";

export const s = {
  briefSection: {
    marginBottom: 24,
  } satisfies CSSProperties,
  overviewGrid: {
    display: "grid",
    // minmax(0, 1fr), not 1fr: a bare `1fr` track still floors at its item's
    // min-content width (long unbreakable file:line paths in BlastRadiusCard
    // easily exceed half the row), so the two columns rendered unequal widths
    // — this pins both to exactly half regardless of content, matching the
    // Intent/Blast-Radius figma (both == half of the Description row below).
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
    marginBottom: 24,
  } satisfies CSSProperties,
  overviewGridCell: {
    minWidth: 0,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
    marginBottom: 24,
  } satisfies CSSProperties,
} as const;
