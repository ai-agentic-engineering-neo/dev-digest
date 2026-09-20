export const SKILL_TABS = ["config", "preview", "stats"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const DEFAULT_SKILL_TAB: SkillTab = "config";
