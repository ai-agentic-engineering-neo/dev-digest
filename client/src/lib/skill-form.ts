/* skill-form.ts — form model + validation for a skill, shared by the create/import drawer and the Config tab. */
import {
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  SkillInput,
  type Skill,
  type SkillType,
  type SkillUpdate,
} from "@devdigest/shared";

export const SKILL_FIELD_MAX = {
  name: SKILL_NAME_MAX,
  description: SKILL_DESCRIPTION_MAX,
  body: SKILL_BODY_MAX,
} as const;

export interface SkillFormValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export type FieldErrorCode = "required" | "tooLong" | "nameFormat" | "invalid";
export type FieldErrors = Partial<Record<keyof SkillFormValues, { code: FieldErrorCode; max?: number }>>;

export const EMPTY_VALUES: SkillFormValues = { name: "", description: "", type: "custom", body: "" };

export function valuesFromSkill(skill: Skill): SkillFormValues {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** Validates against the shared SkillInput schema; returns per-field error codes (empty = valid). */
export function validateSkillForm(values: SkillFormValues): FieldErrors {
  const result = SkillInput.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof SkillFormValues | undefined;
    if (!field || (!(field in SKILL_FIELD_MAX) && field !== "type") || errors[field]) continue;
    if (issue.code === "too_small") errors[field] = { code: "required" };
    else if (issue.code === "too_big") errors[field] = { code: "tooLong", max: SKILL_FIELD_MAX[field as keyof typeof SKILL_FIELD_MAX] };
    else if (issue.code === "invalid_string") errors[field] = { code: "nameFormat" };
    else errors[field] = { code: "invalid" };
  }
  return errors;
}

/** Only the fields whose value differs from the saved skill (empty object = not dirty). */
export function changedFields(values: SkillFormValues, saved: SkillFormValues): SkillUpdate {
  const patch: SkillUpdate = {};
  if (values.name !== saved.name) patch.name = values.name;
  if (values.description !== saved.description) patch.description = values.description;
  if (values.type !== saved.type) patch.type = values.type;
  if (values.body !== saved.body) patch.body = values.body;
  return patch;
}
