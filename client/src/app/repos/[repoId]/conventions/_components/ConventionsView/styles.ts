import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page. Mirrors the Pull Requests
 *  list's page-header shape (../../pulls/styles.ts) for visual consistency. */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  headerActions: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  acceptedCount: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginRight: 4,
  } satisfies CSSProperties,
  cardGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: "14px 32px 44px",
  } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: "14px 32px 44px",
  } satisfies CSSProperties,
} as const;
