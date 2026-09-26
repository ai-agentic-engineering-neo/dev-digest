import type { CSSProperties } from "react";

export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "20px 24px 16px",
    padding: "14px 16px",
    borderRadius: 10,
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bannerIcon: {
    color: "var(--accent)",
    flexShrink: 0,
  } satisfies CSSProperties,
  bannerStrong: {
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,
  bannerRepo: {
    fontFamily: "var(--font-mono)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  body: {
    padding: "0 24px 20px",
  } satisfies CSSProperties,
  nameClash: {
    margin: "0 0 16px",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
  } satisfies CSSProperties,
  nameClashTitle: {
    fontWeight: 600,
    marginBottom: 8,
  } satisfies CSSProperties,
  nameClashOptions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  bodyFooter: {
    display: "flex",
    justifyContent: "flex-end",
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 6,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  footerNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginRight: "auto",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
};
