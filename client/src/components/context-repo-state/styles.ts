import type { CSSProperties } from "react";

export const s = {
  blocking: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 8,
    padding: "56px 28px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  blockingIcon: { color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  blockingTitle: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  blockingBody: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 380, lineHeight: 1.5 } satisfies CSSProperties,
  blockingAction: { marginTop: 10 } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
  bannerText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  bannerTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  bannerBody: { fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
