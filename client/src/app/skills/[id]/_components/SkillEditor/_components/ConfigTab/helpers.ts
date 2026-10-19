import type { Skill, SkillType, SkillUpdateBody } from "@devdigest/shared";

/** Local, editable copy of a skill + the change note for a new body version. */
export interface ConfigDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  note: string;
}

export function draftFrom(skill: Skill): ConfigDraft {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
    note: "",
  };
}

export function isValid(d: ConfigDraft): boolean {
  return d.name.trim() !== "" && d.description.trim() !== "" && d.body.trim() !== "";
}

export function isDirty(d: ConfigDraft, skill: Skill): boolean {
  return (
    d.name.trim() !== skill.name ||
    d.description.trim() !== skill.description ||
    d.type !== skill.type ||
    d.body !== skill.body ||
    d.enabled !== skill.enabled
  );
}

/** Only changed fields; the note travels only with a body change (it labels the new version). */
export function toPatch(d: ConfigDraft, skill: Skill): SkillUpdateBody {
  const patch: SkillUpdateBody = {};
  if (d.name.trim() !== skill.name) patch.name = d.name.trim();
  if (d.description.trim() !== skill.description) patch.description = d.description.trim();
  if (d.type !== skill.type) patch.type = d.type;
  if (d.enabled !== skill.enabled) patch.enabled = d.enabled;
  if (d.body !== skill.body) {
    patch.body = d.body;
    if (d.note.trim()) patch.version_message = d.note.trim();
  }
  return patch;
}
