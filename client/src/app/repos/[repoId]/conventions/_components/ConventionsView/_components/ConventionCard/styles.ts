import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. Mirrors SkillRailCard's card shape
 *  (../../../../skills/_components/SkillsView/_components/SkillRailCard). */
export const s = {
  card: (status: "pending" | "accepted" | "rejected"): CSSProperties => ({
    padding: 16,
    borderRadius: 10,
    border:
      "1px solid " +
      (status === "accepted"
        ? "var(--ok)"
        : status === "rejected"
          ? "var(--border)"
          : "var(--border-strong)"),
    background: "var(--bg-elevated)",
    opacity: status === "rejected" ? 0.55 : 1,
  }),
  topRow: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  body: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 } satisfies CSSProperties,
  categoryBadgeRow: { display: "flex", gap: 6, marginTop: 6 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  evidenceBlock: {
    marginTop: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  evidenceCode: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  } satisfies CSSProperties,
  confidenceBarWrap: { flex: 1, maxWidth: 160 } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
