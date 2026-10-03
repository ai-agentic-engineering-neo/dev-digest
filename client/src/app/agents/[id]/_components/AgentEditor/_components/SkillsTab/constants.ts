import type { SkillType } from "@devdigest/shared";

/** Skill type → badge colour (rubric/convention/security/custom). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#8b5cf6",
};
