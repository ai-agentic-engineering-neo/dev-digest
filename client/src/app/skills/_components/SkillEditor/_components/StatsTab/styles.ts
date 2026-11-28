import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 1000, display: "flex", flexDirection: "column", gap: 16 },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14 },
  panels: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 },
  panel: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  },
  panelTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    marginBottom: 8,
    fontSize: 13.5,
  },
  agentName: { flex: 1, fontWeight: 600 },
  empty: { fontSize: 13, color: "var(--text-muted)" },
  note: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 },
} satisfies Record<string, CSSProperties>;
