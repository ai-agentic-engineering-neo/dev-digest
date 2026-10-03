import type { Skill, SkillType } from "@devdigest/shared";
import { SKILL_TYPE_META } from "./constants";

/** Resolve the chip icon + colour for a skill's type (falls back to custom). */
export function skillTypeMeta(type: SkillType) {
  return SKILL_TYPE_META[type] ?? SKILL_TYPE_META.custom;
}

/** Case-insensitive filter over a skill's name + description. Mirrors
 *  agents/_components/AgentsListView/helpers.ts's filterAgents. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}
