import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 10 } as CSSProperties,
  top: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } as CSSProperties,
  titleBlock: { display: "flex", flexDirection: "column", gap: 4 } as CSSProperties,
  title: { margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  subtitle: { margin: 0, fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12 } as CSSProperties,
  toggle: { display: "flex", gap: 4 } as CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-muted)" } as CSSProperties,
  prNumber: { fontFamily: "var(--font-mono)", color: "var(--text-primary)" } as CSSProperties,
  prTitle: { color: "var(--text-primary)" } as CSSProperties,
};
