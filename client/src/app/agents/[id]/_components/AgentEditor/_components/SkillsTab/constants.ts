import type { SkillType } from "@devdigest/shared";

/** Skill type → chip colour (rubric=blue, convention=green, security=red,
    custom=gray). Kept local to this tab — not re-exported from
    `@devdigest/ui`, so it isn't shared with the `/skills` editor's own copy. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "var(--text-secondary)",
};
