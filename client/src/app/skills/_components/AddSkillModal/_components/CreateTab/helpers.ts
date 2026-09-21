import type { SkillType } from "@devdigest/shared";
import type { CreateSkillInput } from "@/lib/hooks/skills";

export interface CreateForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** Name and body are the only required fields. */
export function canCreate(form: CreateForm): boolean {
  return form.name.trim() !== "" && form.body.trim() !== "";
}

/** `POST /skills` payload: trimmed name/description, body verbatim, empty description omitted. */
export function buildCreatePayload(form: CreateForm): CreateSkillInput {
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(description ? { description } : {}),
    type: form.type,
    body: form.body,
    source: "manual",
  };
}
