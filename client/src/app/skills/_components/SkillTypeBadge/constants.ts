import type { SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Skill type → icon + colour tokens (badge, card icon, detail header). */
export const SKILL_TYPE_STYLE: Record<SkillType, { icon: IconName; color: string; bg: string }> = {
  rubric: { icon: "ListChecks", color: "var(--info)", bg: "var(--info-bg)" },
  convention: { icon: "FileText", color: "var(--sugg)", bg: "var(--sugg-bg)" },
  security: { icon: "Shield", color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { icon: "Sparkles", color: "var(--accent)", bg: "var(--accent-bg)" },
};
