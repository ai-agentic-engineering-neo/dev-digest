import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page (mirrors the pulls list's page shell). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
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
  body: {
    margin: "14px 32px 44px",
  } satisfies CSSProperties,
  droppedNote: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "0 32px 14px",
  } satisfies CSSProperties,
  notReady: {
    margin: "0 32px 20px",
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-primary)",
    fontSize: 14,
  } satisfies CSSProperties,
  notReadyTitle: {
    fontWeight: 700,
    marginBottom: 4,
  } satisfies CSSProperties,
  errorBanner: {
    margin: "0 32px 20px",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
  } satisfies CSSProperties,
  errorBannerText: {
    flex: 1,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    margin: "0 32px 16px",
  } satisfies CSSProperties,
  toolbarCount: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  toolbarSpacer: {
    marginLeft: "auto",
  } satisfies CSSProperties,
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    margin: "0 32px",
  } satisfies CSSProperties,
};
