import type { SkillType } from "@devdigest/shared";

/** Type → chip colour. Falls back to --text-secondary for unknown types. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#8b5cf6",
  security: "#ef4444",
  custom: "#10b981",
};
