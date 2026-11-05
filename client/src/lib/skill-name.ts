/**
 * Skill name rule — one copy for every client form that creates a skill
 * (Skills Lab Config, "Create skill from conventions"). Same rule as the server
 * (server/src/modules/_shared/skill-name.ts → SKILL_NAME_PATTERN).
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}

/** A skill form can be submitted when every field is present and the name is kebab-case. */
export function canSubmitSkill(form: { name: string; description: string; body: string }): boolean {
  return isValidSkillName(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}
