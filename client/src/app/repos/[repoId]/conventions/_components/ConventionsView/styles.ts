import type { CSSProperties } from "react";

export const s = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 32px 48px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  titleRepo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, margin: "22px 0 16px" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  toolbarRight: { marginLeft: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  notCloned: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 14, marginTop: 22 } satisfies CSSProperties,
} as const;
