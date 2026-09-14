import type { SkillType } from "@devdigest/shared";

/** Tabs the Skill Editor understands; anything else in ?tab= falls back to the first. */
export const VALID_TABS = ["config", "preview", "context", "evals", "stats", "versions"] as const;
export type SkillTab = (typeof VALID_TABS)[number];
export const DEFAULT_TAB: SkillTab = VALID_TABS[0];

/** Skill types, in the order the Config select offers them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Badge colour per skill type. Security reads as a warning, the rest are neutral-ish. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--info)",
  convention: "var(--accent)",
  security: "var(--warn)",
  custom: "var(--text-secondary)",
};

/** Body a freshly created skill starts with — enough to show the editor working. */
export const NEW_SKILL_BODY = "# New skill\n\nDescribe the rule this skill applies…\n";

/** Slug a new skill gets before the user renames it in Config. */
export const NEW_SKILL_BASE_NAME = "new-skill";
