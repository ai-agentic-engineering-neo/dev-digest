/**
 * Skill name rule — one copy for every client form that creates a skill
 * (Skills Lab Config, "Create skill from conventions"). Same rule as the server
 * (server/src/modules/_shared/skill-name.ts → SKILL_NAME_PATTERN).
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}
