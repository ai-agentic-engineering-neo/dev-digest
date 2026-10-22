import type { SkillType } from "@devdigest/shared";

/** Chip colour per skill type (Skills list, skill editor, agent Skills tab). */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--warn)",
};
