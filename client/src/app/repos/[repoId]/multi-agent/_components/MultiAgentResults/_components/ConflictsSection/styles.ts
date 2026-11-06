import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 12 } as CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as CSSProperties,
  title: { fontSize: 14, fontWeight: 600, margin: 0 } as CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } as CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } as CSSProperties,
};
