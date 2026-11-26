import type { ConventionCategory } from '@devdigest/shared';
import type { SuggestionAgent } from './helpers.js';

/**
 * Ports the skills use cases own (onion-architecture: the port lives with its
 * consumer). Implemented read-only by `DrizzleAgentSuggestionSignals`
 * (repository.ts); wired in routes.ts.
 */

/** Read-only facts the agent-suggestion use case scores against. */
export interface AgentSuggestionSignals {
  /** Distinct categories of the workspace's non-rejected conventions marked as in this skill. */
  skillCategories(workspaceId: string, skillId: string): Promise<ConventionCategory[]>;
  /** Enabled agents of the workspace that do not have the skill linked yet. */
  candidateAgents(workspaceId: string, skillId: string): Promise<SuggestionAgent[]>;
}
