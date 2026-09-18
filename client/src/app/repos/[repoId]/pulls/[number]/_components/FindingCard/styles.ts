import type { CSSProperties } from "react";

/** Co-located styles for FindingCard (extracted from inline styles). */
export const s = {
  card: (focused: boolean, sevColor: string, muted: boolean): CSSProperties => ({
    borderRadius: 8,
    // Per-side colours: `borderColor` is itself a shorthand, and React warns
    // when it changes on rerender while `borderLeftColor` is also set.
    borderStyle: "solid",
    borderTopColor: focused ? sevColor : "var(--border)",
    borderRightColor: focused ? sevColor : "var(--border)",
    borderBottomColor: focused ? sevColor : "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: sevColor,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    opacity: muted ? 0.6 : 1,
    transition: "opacity .2s, border-color .12s, box-shadow .12s",
    boxShadow: focused ? "0 0 0 1px " + sevColor : "none",
  }),
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    cursor: "pointer",
  } satisfies CSSProperties,
  badgeWrap: { paddingTop: 1 } satisfies CSSProperties,
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: (muted: boolean, accepted: boolean): CSSProperties => ({
    fontSize: 14,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    // Strikethrough marks an ACCEPTED finding (resolved), not a dismissed one.
    textDecoration: accepted ? "line-through" : "none",
  }),
  acceptedTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--ok)",
    background: "var(--ok-bg)",
    padding: "2px 8px",
    borderRadius: 99,
    flexShrink: 0,
  } satisfies CSSProperties,
  dismissedTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    padding: "2px 8px",
    borderRadius: 99,
    flexShrink: 0,
  } satisfies CSSProperties,
  /** Blue border marking whichever action (Accept/Dismiss) matches the
   *  finding's current persisted state — that button is also `disabled`.
   *  An outline, not a border: toggling border longhands against Button's
   *  own `border` shorthand triggers React's conflicting-style warning. */
  pressedBorder: {
    outline: "2px solid var(--accent)",
    outlineOffset: -1,
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 5,
  } satisfies CSSProperties,
  chevron: (expanded: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform .15s",
    marginTop: 2,
    flexShrink: 0,
  }),
  body: { padding: "14px 16px 16px", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  trifectaWrap: { marginBottom: 14 } satisfies CSSProperties,
  prose: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  suggestionWrap: { marginTop: 14 } satisfies CSSProperties,
  suggestionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginBottom: 8,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  composer: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  composerActions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
