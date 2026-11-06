import type { CSSProperties } from "react";
import type { Severity } from "@devdigest/shared";
import { SEV_DOT_COLOR } from "./constants";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } as CSSProperties,
  cardHead: { display: "flex", flexDirection: "column", gap: 2 } as CSSProperties,
  location: { fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: "var(--text-muted)" } as CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 600 } as CSSProperties,
  takes: { display: "flex", flexWrap: "wrap", gap: 10, listStyle: "none", margin: 0, padding: 0 } as CSSProperties,
  take: { display: "flex", flexDirection: "column", gap: 4, minWidth: 160, flex: 1, fontSize: 12 } as CSSProperties,
  takeHead: { display: "flex", alignItems: "center", gap: 6 } as CSSProperties,
  persona: { fontWeight: 600 } as CSSProperties,
  verdict: { display: "flex", alignItems: "center", gap: 6 } as CSSProperties,
  dot: (severity: Severity): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: SEV_DOT_COLOR[severity],
    flexShrink: 0,
  }),
  note: { color: "var(--text-muted)" } as CSSProperties,
};
