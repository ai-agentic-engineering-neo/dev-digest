import type { CSSProperties } from "react";

/** Co-located styles for RunHistory (extracted from inline styles). */

/** Class for the "go to review" agent-name link. Its hover state is a REAL
 *  `:hover` CSS rule (see `css` below) rather than onMouseEnter/onMouseLeave
 *  state — this file has no mouse-state precedent, and a CSS rule is both
 *  cheaper and the established convention here. */
export const GO_TO_REVIEW_CLASS = "dd-run-goto";

/** Injected once by RunHistory — `styles.ts` can only express static
 *  declarations, and `:hover` is not expressible as a React style object. */
export const css = `
.${GO_TO_REVIEW_CLASS} { color: var(--text-primary); text-decoration: none; }
.${GO_TO_REVIEW_CLASS}:hover { color: var(--accent); text-decoration: none; }
`;

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
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
  // Commits are markers, not actions — lighter (dashed, transparent) so they
  // read as separators between the runs they sit chronologically between.
  commitRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
  } satisfies CSSProperties,
  // The commit IDENTIFIER (icon + sha) is accent-blue so a commit is instantly
  // separable from a run row. The message stays muted on purpose — colouring it
  // too would flatten the hierarchy and make commits shout over the runs.
  commitIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  commitSha: {
    fontSize: 12,
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  commitMessage: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  commitMeta: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  agentLine: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  goToReview: (clickable: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    cursor: clickable ? "pointer" : "default",
  }),
  modelText: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  errorText: {
    fontSize: 12,
    color: "var(--crit)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  countsText: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  metaCol: {
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
} as const;
