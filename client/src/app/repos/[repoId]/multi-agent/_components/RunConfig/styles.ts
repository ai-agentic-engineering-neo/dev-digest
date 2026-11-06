import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 920 } as CSSProperties,
  title: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 } as CSSProperties,
  intro: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0" } as CSSProperties,
  step: { display: "flex", flexDirection: "column", gap: 10 } as CSSProperties,
  stepHead: { display: "flex", alignItems: "center", justifyContent: "space-between" } as CSSProperties,
  stepTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  placeholder: {
    padding: 24,
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
  } as CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 } as CSSProperties,
  runBar: { display: "flex", alignItems: "center", gap: 12 } as CSSProperties,
  total: { fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
};
