import type { CSSProperties } from "react";
import { agentColorVar } from "@/components/agent-badge";

export const s = {
  card: (checked: boolean, disabled: boolean, colorIndex: number): CSSProperties => ({
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${checked ? agentColorVar(colorIndex) : "var(--border)"}`,
    background: "var(--bg-elevated)",
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  body: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 } as CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8 } as CSSProperties,
  name: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as CSSProperties,
  model: { fontSize: 11.5, color: "var(--text-muted)" } as CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)" } as CSSProperties,
};
