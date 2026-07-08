import type { CSSProperties } from "react";

export const s = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    // Match the design: padded and centered rather than flush to the shell.
    padding: "24px 28px 44px",
    maxWidth: 1200,
    margin: "0 auto",
    width: "100%",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  h1: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    marginBottom: 4,
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
} as const;
