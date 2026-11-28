import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 780 },
  header: { display: "flex", alignItems: "center", marginBottom: 20 },
  h2: { fontSize: 18, fontWeight: 700 },
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  tokens: { fontSize: 12, color: "var(--text-muted)" },
  actions: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" },
  deleteWrap: { marginLeft: "auto" },
} satisfies Record<string, CSSProperties>;
