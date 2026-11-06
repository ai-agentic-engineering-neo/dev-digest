import type { CSSProperties } from "react";
import { agentColorVar, agentTint } from "./helpers";

export const s = {
  badge: (colorIndex: number, size: number): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: Math.max(4, Math.round(size / 4)),
    background: agentTint(colorIndex),
    color: agentColorVar(colorIndex),
  }),
};
