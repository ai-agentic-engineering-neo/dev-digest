import type { SkillType } from "@devdigest/shared";

/** Type → chip colour. Copied from SkillCard — do not import across routes. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#8b5cf6",
  security: "#ef4444",
  custom: "#10b981",
};
