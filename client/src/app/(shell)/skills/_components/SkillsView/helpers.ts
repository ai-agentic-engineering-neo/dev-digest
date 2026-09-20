import { SKILL_TYPES } from "./constants";
import type { SkillType, Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/**
 * The type picker's options, translated. All three pickers under this view
 * (create modal, config tab, import drawer) render the same list, so the shape
 * lives once — adding an icon or a disabled flag later is one edit.
 */
export function skillTypeOptions(t: (key: string) => string): Array<{ value: SkillType; label: string }> {
  return SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
}
