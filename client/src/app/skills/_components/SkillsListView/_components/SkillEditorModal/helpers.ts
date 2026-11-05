import type { Skill } from "@devdigest/shared";
import type { SkillInput } from "../../../../../../lib/hooks/skills";
import { SKILL_NAME_PATTERN } from "./constants";

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}

/** The form can be submitted when every field is present and the name is kebab-case. */
export function canSubmitSkill(form: SkillInput): boolean {
  return isValidSkillName(form.name) && form.description.trim().length > 0 && form.body.trim().length > 0;
}

/** Only the fields that changed vs the saved skill (empty → nothing to save). */
export function skillPatch(skill: Skill, form: SkillInput): Partial<SkillInput> {
  const patch: Partial<SkillInput> = {};
  if (form.name !== skill.name) patch.name = form.name;
  if (form.description.trim() !== skill.description) patch.description = form.description.trim();
  if (form.type !== skill.type) patch.type = form.type;
  if (form.body !== skill.body) patch.body = form.body;
  return patch;
}
