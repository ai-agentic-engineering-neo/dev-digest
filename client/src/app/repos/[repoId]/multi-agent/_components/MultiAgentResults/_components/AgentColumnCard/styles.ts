import type { CSSProperties } from "react";

export const s = {
  root: (accent: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
    padding: 12,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderTop: `2px solid ${accent}`,
    borderRadius: 8,
  }),
  header: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } as CSSProperties,
  headerText: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 } as CSSProperties,
  name: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" } as CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 6, flex: 1 } as CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } as CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } as CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", wordBreak: "break-word" } as CSSProperties,
  statusLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } as CSSProperties,
};
