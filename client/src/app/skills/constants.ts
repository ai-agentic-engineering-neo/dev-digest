import type { SkillType } from "@devdigest/shared";

/** D3 — a skill name is a slug, unique per workspace. */
export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Stats window (§7.2 default). */
export const DEFAULT_STATS_WINDOW_DAYS = 30;
