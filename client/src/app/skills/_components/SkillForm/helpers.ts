import type { Skill } from "@devdigest/shared";
import type { SkillFormValue } from "./SkillForm";

/** The editable slice of a skill, as the shared form holds it. */
export const toSkillFormValue = (sk: Skill): SkillFormValue => ({
  name: sk.name,
  description: sk.description,
  type: sk.type,
  body: sk.body,
  enabled: sk.enabled,
});
