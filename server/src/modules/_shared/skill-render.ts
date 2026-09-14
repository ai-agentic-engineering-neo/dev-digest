import type { SkillType } from '@devdigest/shared';

/**
 * THE ONE renderer for a skill's prompt block. Lives in `_shared` (exempt from
 * `no-cross-module`) because both the skills module (`GET /skills/:id/preview`)
 * and the reviews module (`run-executor.ts`, which injects the block into the
 * prompt) call it — modules compose through here, not by importing each other.
 *
 * If a second copy of this formatting ever appears, the Preview tab silently
 * starts lying about what the model actually receives.
 *
 * The `### Skill: <name>` heading is load-bearing: plain concatenation makes
 * four skills read as one undifferentiated wall of instructions, and the name
 * is what the model cites back and what the run log asserts on.
 */

/** The subset of a skill needed to render its prompt block. */
export interface RenderableSkill {
  name: string;
  type: SkillType;
  body: string;
}

export function renderSkillBlock(skill: RenderableSkill): string {
  return `### Skill: ${skill.name} (${skill.type})\n${skill.body.trim()}`;
}
