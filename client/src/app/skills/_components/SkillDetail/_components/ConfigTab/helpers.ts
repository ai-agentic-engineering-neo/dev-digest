/** Pure helpers for the skill Config tab. */
import type { Skill, UpdateSkillInput } from "@devdigest/shared";
import type { SkillFormValues } from "@/app/skills/_components/helpers";

/** Initial form values from the saved skill. */
export function formFromSkill(skill: Skill): Required<SkillFormValues> {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body, message: "" };
}

export function isBodyChanged(form: SkillFormValues, skill: Skill): boolean {
  return form.body !== skill.body;
}

/**
 * Only the fields that differ from the saved skill. `message` goes along only
 * with a body change (it labels the new version) and only when non-blank —
 * the server then writes its default "Edited body". An empty patch = pristine.
 */
export function buildSkillPatch(form: SkillFormValues, skill: Skill): UpdateSkillInput {
  const patch: UpdateSkillInput = {};
  if (form.name !== skill.name) patch.name = form.name;
  if (form.description !== skill.description) patch.description = form.description;
  if (form.type !== skill.type) patch.type = form.type;
  if (isBodyChanged(form, skill)) {
    patch.body = form.body;
    const message = form.message?.trim();
    if (message) patch.message = message;
  }
  return patch;
}
