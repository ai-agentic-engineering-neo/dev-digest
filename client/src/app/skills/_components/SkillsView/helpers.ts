import type { SkillListItem } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description + type. */
export function filterSkills(skills: SkillListItem[], search: string): SkillListItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description} ${sk.type}`.toLowerCase().includes(q));
}
