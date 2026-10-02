import type { SkillWithStats } from "@devdigest/shared";
import { NEW_SKILL_BASE_NAME } from "./constants";

/** Rail search — name and description, case-insensitive. */
export function filterSkills(skills: SkillWithStats[], q: string): SkillWithStats[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle),
  );
}

/**
 * First free `new-skill`, `new-skill-2`, … for the Add ▸ Create path. Skill
 * names are workspace-unique, so guessing blind would 409 on the second click.
 */
export function nextSkillName(skills: { name: string }[]): string {
  const taken = new Set(skills.map((s) => s.name));
  if (!taken.has(NEW_SKILL_BASE_NAME)) return NEW_SKILL_BASE_NAME;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${NEW_SKILL_BASE_NAME}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${NEW_SKILL_BASE_NAME}-${Date.now()}`;
}
