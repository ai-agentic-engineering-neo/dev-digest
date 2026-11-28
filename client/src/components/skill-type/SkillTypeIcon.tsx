/* SkillTypeIcon — a square Sparkles icon tinted by the skill's type. */
import React from "react";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_TONE } from "./constants";
import { s } from "./styles";

export function SkillTypeIcon({ type, size = 26 }: { type: SkillType; size?: number }) {
  return (
    <span style={s.icon(SKILL_TYPE_TONE[type], size)} aria-hidden="true">
      <Icon.Sparkles size={Math.round(size * 0.55)} />
    </span>
  );
}
