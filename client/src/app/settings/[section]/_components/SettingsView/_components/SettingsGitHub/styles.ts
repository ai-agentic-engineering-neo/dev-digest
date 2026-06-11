import type { CSSProperties } from "react";

/** Co-located styles for SettingsGitHub. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  statusCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 20,
  } satisfies CSSProperties,
  dot: (ok: boolean): CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: "50%",
    flexShrink: 0,
    background: ok ? "var(--ok)" : "var(--text-muted)",
  }),
  statusText: { flex: 1 } satisfies CSSProperties,
  statusTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  statusSub: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  repoList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 } satisfies CSSProperties,
  repoItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  repoName: { fontWeight: 600 } satisfies CSSProperties,
  repoBranch: { marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
