import type { CSSProperties } from "react";
import type { SkillTypeTone } from "./constants";

/** Styles for the skill type badge and icon. */
export const s = {
  icon: (tone: SkillTypeTone, size: number): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: 7,
    background: tone.bg,
    color: tone.c,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
} as const;
