import type { Skill, SkillStatsSummary, SkillType } from "@devdigest/shared";

/** Search (name + description, case-insensitive) and type filter. */
export function filterSkills(skills: readonly Skill[], search: string, type: SkillType | null): Skill[] {
  const q = search.trim().toLowerCase();
  return skills.filter(
    (s) => (!type || s.type === type) && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q)),
  );
}

/** Index the card stats by skill id. */
export function statsById(rows: readonly SkillStatsSummary[] | undefined): Map<string, SkillStatsSummary> {
  return new Map((rows ?? []).map((r) => [r.skill_id, r]));
}
