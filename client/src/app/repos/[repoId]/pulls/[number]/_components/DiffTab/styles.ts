import type { CSSProperties } from "react";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_CSS_VAR } from "./constants";

/** Sticky group header stays visible while its body scrolls (client/INSIGHTS.md:
 *  the page scrolls inside `<main overflow:auto>`, so `sticky` here works —
 *  never wrap this in an `overflow:hidden` ancestor). */
export const s = {
  summaryRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  summaryText: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  /* Same colours as the PR header's +N −N (--code-add-text / --code-del-text). */
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  noReviewHint: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  /* Smart / Original order: one segmented control, not two buttons (design/ diff.jsx). */
  segmented: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  segment: (active: boolean): CSSProperties => ({
    padding: "3px 11px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  roleGroup: {} satisfies CSSProperties,
  roleHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 4px",
    cursor: "pointer",
    border: "none",
    textAlign: "left",
    // Opaque page colour so file cards scroll under the sticky header.
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  roleDot: (role: SmartDiffRole): CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: 2,
    background: ROLE_CSS_VAR[role],
    flexShrink: 0,
  }),
  roleLabel: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  roleHint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  roleSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  roleCounts: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  roleCount: (color: string): CSSProperties => ({ fontSize: 12.5, fontWeight: 700, color, whiteSpace: "nowrap" }),
  roleFilesCount: { fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  roleBody: {
    padding: "2px 0 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),
} as const;
