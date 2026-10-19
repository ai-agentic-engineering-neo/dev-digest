/**
 * L02 — how one skill renders into the review prompt's `## Skills / rules`
 * section. Shared by the skills module (preview) and the review executor, so
 * the trace shows exactly what the model saw. Pure.
 */
export interface PromptSkill {
  name: string;
  description: string;
  body: string;
}

/** The description is the skill's interface (when to apply it), so it leads. */
export function formatSkillForPrompt(skill: PromptSkill): string {
  const when = skill.description.trim() ? `\n${skill.description.trim()}` : '';
  return `### Skill: ${skill.name}${when}\n\n${skill.body.trim()}`;
}
