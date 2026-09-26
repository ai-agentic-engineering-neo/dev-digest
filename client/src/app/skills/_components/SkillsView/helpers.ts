import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.type.includes(q),
  );
}
