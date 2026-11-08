import type { CSSProperties } from "react";

/** Mirrors the doc region padding in ProjectContextView/styles.ts so the header bleeds edge to edge. */
const REGION_PAD_Y = 20;
const REGION_PAD_X = 28;

export const s = {
  // minHeight 100% of the scrolling doc region → the editor can fill the panel height.
  pane: { display: "flex", flexDirection: "column", minHeight: "100%", minWidth: 0 } satisfies CSSProperties,
  // One N6 header row, pinned while the doc scrolls.
  header: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    margin: `-${REGION_PAD_Y}px -${REGION_PAD_X}px 18px`,
    padding: `12px ${REGION_PAD_X}px`,
    background: "var(--bg-primary)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 } satisfies CSSProperties,
  name: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  switch: { display: "inline-flex", gap: 4 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  usedBy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  subMeta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  // No card: the doc reads straight on the panel, as in N6.
  body: { minWidth: 0 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
