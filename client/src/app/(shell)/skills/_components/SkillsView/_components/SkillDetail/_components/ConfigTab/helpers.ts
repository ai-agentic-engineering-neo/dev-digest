import type { Skill, SkillType } from "@devdigest/shared";

export interface SkillFormState {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export const EMPTY_FORM: SkillFormState = {
  name: "",
  description: "",
  type: "convention",
  body: "",
  enabled: true,
};

export const formFromSkill = (skill: Skill): SkillFormState => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
  enabled: skill.enabled,
});

/** Fake filename shown above the body editor: `<name>.md`, falling back to a
   placeholder while the name is still empty (new skill, not yet named). */
export function bodyFilename(name: string): string {
  const slug = name.trim() || "untitled";
  return `${slug}.md`;
}
