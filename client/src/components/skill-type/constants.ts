import type { SkillType } from "@devdigest/shared";

/** A skill type's colour pair, as CSS variables. */
export interface SkillTypeTone {
  c: string;
  bg: string;
}

/** Skill type → badge and icon colours (rubric accent, convention ok, security crit, custom muted). */
export const SKILL_TYPE_TONE: Record<SkillType, SkillTypeTone> = {
  rubric: { c: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { c: "var(--ok)", bg: "var(--ok-bg)" },
  security: { c: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { c: "var(--text-muted)", bg: "var(--bg-hover)" },
};
