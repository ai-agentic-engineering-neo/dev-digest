import type { CSSProperties } from "react";

/** Co-located styles for InlineFindingCard — the finding written out in full
    under the diff line it cites (Smart Order, L03). */
export const s = {
  card: (sevColor: string, muted: boolean): CSSProperties => ({
    // All-longhand (never mix `border` shorthand with `borderLeft`).
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: muted ? "var(--border-strong)" : sevColor,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    opacity: muted ? 0.62 : 1,
    transition: "opacity .2s",
  }),
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px 8px",
  } satisfies CSSProperties,
  iconTile: (color: string, bg: string): CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: 6,
    background: bg,
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sevWord: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color,
  }),
  title: (dismissed: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 650,
    color: "var(--text-primary)",
    textDecoration: dismissed ? "line-through" : "none",
  }),
  acceptedTag: { fontSize: 12, fontWeight: 600, color: "var(--ok)" } satisfies CSSProperties,
  dismissedTag: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  } satisfies CSSProperties,
  lineRange: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: "0 14px 14px 46px" } satisfies CSSProperties,
  prose: {
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  suggestionBox: {
    display: "flex",
    gap: 9,
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  suggestionIcon: { color: "var(--sugg)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  suggestionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
