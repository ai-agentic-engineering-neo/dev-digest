import React from "react";
import { Badge } from "./Badge";

export type SkillType = "rubric" | "convention" | "security" | "custom";

const SKILL_TYPE_COLORS: Record<SkillType, { c: string; bg: string }> = {
  rubric: { c: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { c: "var(--ok)", bg: "var(--ok-bg)" },
  security: { c: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { c: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Skill type chip (rubric / convention / security / custom), color-coded. */
export function SkillTypeTag({ type, label }: { type: SkillType; label?: string }) {
  const c = SKILL_TYPE_COLORS[type] ?? SKILL_TYPE_COLORS.custom;
  return (
    <Badge color={c.c} bg={c.bg} mono style={{ fontSize: 11 }}>
      {label ?? type}
    </Badge>
  );
}
