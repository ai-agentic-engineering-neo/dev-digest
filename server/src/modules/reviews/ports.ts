/**
 * Ports owned by the reviews module (onion §5): the run executor depends on
 * these narrow interfaces, never on another module's service.
 */

/** One enabled skill as it goes into the review prompt. */
export interface PromptSkill {
  name: string;
  version: number;
  body: string;
}

/** Source of the skills an agent's review prompt carries. */
export interface PromptSkillsSource {
  /**
   * The agent's attached skills in `agent_skills.order`, with globally
   * disabled skills (`skills.enabled = false`) already dropped.
   */
  loadPromptSkills(agentId: string): Promise<PromptSkill[]>;
}
