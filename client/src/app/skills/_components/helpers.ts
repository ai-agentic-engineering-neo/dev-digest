/** Pure, domain-aware helpers for the Skills feature (no React). */
import type { Skill, SkillType } from "@devdigest/shared";
import {
  DEFAULT_SKILL_TAB,
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SKILL_MESSAGE_MAX,
  SKILL_NAME_MAX,
  SKILL_NAME_PATTERN,
  SKILL_TABS,
  type SkillTab,
} from "./constants";

/** Case-insensitive search over name + description. A blank query keeps every skill. */
export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter(
    (skill) => skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q),
  );
}

/** `?tab=` → a known tab; anything else (missing, `evals`, junk) falls back to Config. */
export function resolveSkillTab(raw: string | null | undefined): SkillTab {
  return (SKILL_TABS as readonly string[]).includes(raw ?? "") ? (raw as SkillTab) : DEFAULT_SKILL_TAB;
}

/** Detail URL for a skill on a given tab. */
export function skillHref(id: string, tab: SkillTab): string {
  return `/skills/${encodeURIComponent(id)}?tab=${tab}`;
}

/** The editable text fields shared by the create modal and the Config tab. */
export interface SkillFormValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** "What changed?" — only meaningful when the body changed. */
  message?: string;
}

/** Message key under `skills.form.errors` plus the ICU values it needs. */
export interface FieldError {
  key:
    | "nameRequired"
    | "nameFormat"
    | "nameTaken"
    | "descriptionTooLong"
    | "bodyRequired"
    | "bodyTooLong"
    | "messageTooLong";
  values?: { max: number };
}

export type SkillFormErrors = Partial<Record<"name" | "description" | "body" | "message", FieldError>>;

/** Client-side validation mirroring the contract (the server re-validates). */
export function validateSkillForm(form: SkillFormValues): SkillFormErrors {
  const errors: SkillFormErrors = {};
  if (!form.name) errors.name = { key: "nameRequired" };
  else if (form.name.length > SKILL_NAME_MAX || !SKILL_NAME_PATTERN.test(form.name))
    errors.name = { key: "nameFormat" };
  if (form.description.length > SKILL_DESCRIPTION_MAX)
    errors.description = { key: "descriptionTooLong", values: { max: SKILL_DESCRIPTION_MAX } };
  if (!form.body.trim()) errors.body = { key: "bodyRequired" };
  else if (form.body.length > SKILL_BODY_MAX) errors.body = { key: "bodyTooLong", values: { max: SKILL_BODY_MAX } };
  if ((form.message ?? "").length > SKILL_MESSAGE_MAX)
    errors.message = { key: "messageTooLong", values: { max: SKILL_MESSAGE_MAX } };
  return errors;
}

export function hasErrors(errors: SkillFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
