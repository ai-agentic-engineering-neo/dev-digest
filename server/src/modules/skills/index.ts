/**
 * Public surface of the skills module (M2): the only file another module may
 * import. The review run loads skills through its own `AgentSkills` port,
 * wired from `container.skillsService`.
 */
export type { EffectiveSkill, SkillContent } from './domain.js';
