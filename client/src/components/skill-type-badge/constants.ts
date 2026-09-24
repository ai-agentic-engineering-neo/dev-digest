import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Icon + accent colour per skill type (skill cards, editor, agent Skills tab). */
export const SKILL_TYPE_STYLE: Record<SkillType, { icon: IconName; color: string }> = {
  rubric: { icon: "ListChecks", color: "#8b5cf6" },
  convention: { icon: "Code", color: "#3b82f6" },
  security: { icon: "Shield", color: "#ef4444" },
  custom: { icon: "Sparkles", color: "#f59e0b" },
};
