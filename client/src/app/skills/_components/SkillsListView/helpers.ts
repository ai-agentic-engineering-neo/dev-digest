import type { Skill } from "@devdigest/shared";

/** Case-insensitive match on name, description and type. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (sk) =>
      sk.name.toLowerCase().includes(q) ||
      sk.description.toLowerCase().includes(q) ||
      sk.type.includes(q),
  );
}

/** Imported / community skills are untrusted third-party text. */
export function isImportedSkill(skill: Pick<Skill, "source">): boolean {
  return skill.source === "community" || skill.source === "imported_url";
}
