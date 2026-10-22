import type { Skill } from "@devdigest/shared";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) =>
    [sk.name, sk.description, sk.type].some((field) => field.toLowerCase().includes(q)),
  );
}
