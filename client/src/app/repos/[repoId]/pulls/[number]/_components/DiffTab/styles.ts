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
  noReviewHint: { fontSize: 12.5, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  roleGroup: {
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  roleHeader: (open: boolean): CSSProperties => ({
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    background: "var(--bg-elevated)",
    borderRadius: open ? "7px 7px 0 0" : 7,
  }),
  roleDot: (role: SmartDiffRole): CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: 2,
    background: ROLE_CSS_VAR[role],
    flexShrink: 0,
  }),
  roleLabel: { fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  roleHint: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  roleSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  toggleButton: { marginLeft: "auto" } satisfies CSSProperties,
  roleFlagged: { fontSize: 12.5, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  roleFilesCount: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  roleBody: {
    borderTop: "1px solid var(--border)",
    borderRadius: "0 0 7px 7px",
    padding: 10,
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
