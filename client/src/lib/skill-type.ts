/* Shared presentation tokens for SkillType (used by the Skills page and the
   agent Skills tab). Colours are design tokens, never raw hex. */
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const SKILL_TYPE_STYLE: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--info)", bg: "var(--info-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
