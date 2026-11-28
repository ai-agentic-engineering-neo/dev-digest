import type { CSSProperties } from "react";

export const s = {
  sidebar: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  },
  header: { padding: "16px 16px 12px" },
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: 700, flex: 1 },
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" },
  skeletons: { display: "flex", flexDirection: "column", gap: 10 },
  noMatch: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" },
} satisfies Record<string, CSSProperties>;
