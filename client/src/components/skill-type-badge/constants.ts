import type { SkillType } from "@devdigest/shared";

/** Colour per skill type (CSS variables only — matches the Skills design). */
export const SKILL_TYPE_COLOR: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Stable display order for type pickers. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
