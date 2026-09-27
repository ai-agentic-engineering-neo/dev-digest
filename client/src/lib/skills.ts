import type { Skill } from "@devdigest/shared";

/**
 * Cross-route skill helpers. Two screens filter the same list — `/skills` and
 * the agent editor's Skills tab — and "what counts as a match" has to mean the
 * same thing on both, so it lives here rather than in either route.
 */

/** Case-insensitive match over the two fields a user searches by. */
export function matchesSkillQuery(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
  );
}

export function filterSkills(skills: Skill[], query: string): Skill[] {
  if (!query.trim()) return skills;
  return skills.filter((s) => matchesSkillQuery(s, query));
}
