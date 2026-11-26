import type { SkillType } from "@devdigest/shared";

/** Type badge colours (label comes from `agents.skills.types.*`). */
export const SKILL_TYPE_COLOR: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--info)", bg: "var(--info-bg)" },
  convention: { color: "var(--sugg)", bg: "var(--sugg-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Skills workspace route (empty-state link). */
export const SKILLS_ROUTE = "/skills";

/** Placeholder rows while skills load. */
export const SKELETON_ROWS = 3;
