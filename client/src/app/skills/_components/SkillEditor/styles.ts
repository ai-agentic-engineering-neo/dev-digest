import type { CSSProperties } from "react";

export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 28px 0", flexShrink: 0 },
  icon: { color: "var(--accent)" },
  title: { fontSize: 18, fontWeight: 700 },
  version: {
    fontSize: 12,
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "1px 7px",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  tabsBar: { marginTop: 14 },
  body: { flex: 1, overflow: "auto", padding: 28 },
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 },
} satisfies Record<string, CSSProperties>;
