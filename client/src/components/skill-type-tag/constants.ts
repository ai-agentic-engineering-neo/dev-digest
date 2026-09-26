import type { SkillType } from "@devdigest/shared";

/** Every skill type, in display order (mirrors the shared enum; the client imports types only). */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Colour per skill type (CSS variables from the design system; never hard-coded). */
export const SKILL_TYPE_COLOR: Record<SkillType, { c: string; bg: string }> = {
  rubric: { c: "var(--info)", bg: "var(--info-bg)" },
  convention: { c: "var(--sugg)", bg: "var(--sugg-bg)" },
  security: { c: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { c: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
