import type { Skill, SkillType } from "@devdigest/shared";

/**
 * The editable half of a skill, held as a draft while the user types.
 *
 * It lives above the tabs rather than inside the Config tab so that switching
 * to Preview to see how an edit renders does not discard the edit — and so the
 * Preview tab can show what is about to be saved rather than what already was.
 */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function draftFromSkill(skill: Skill): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
  };
}

/** True when the draft differs from the saved skill in any editable field. */
export function isDirty(draft: SkillDraft, skill: Skill): boolean {
  return (
    draft.name !== skill.name ||
    draft.description !== skill.description ||
    draft.type !== skill.type ||
    draft.body !== skill.body
  );
}
