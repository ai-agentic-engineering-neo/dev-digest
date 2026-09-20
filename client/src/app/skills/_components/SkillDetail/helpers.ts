import { DEFAULT_SKILL_TAB, SKILL_TABS, type SkillTab } from "./constants";

/** Any unknown / missing `?tab=` value falls back to the Config tab. */
export function parseSkillTab(raw: string | null | undefined): SkillTab {
  return SKILL_TABS.find((t) => t === raw) ?? DEFAULT_SKILL_TAB;
}
