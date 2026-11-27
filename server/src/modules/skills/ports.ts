import type { ConventionCategory } from '@devdigest/shared';
import type { SuggestionAgent } from './helpers.js';

/**
 * Ports the skills use cases own (onion-architecture: the port lives with its
 * consumer). Implemented read-only by `DrizzleAgentSuggestionSignals`
 * (repository.ts); wired in routes.ts.
 */

/** A text document fetched from a URL (the URL actually read, after redirects). */
export interface FetchedText {
  url: string;
  text: string;
}

/**
 * Fetches a remote text file for "Import from URL". The implementation owns the
 * SSRF rules (https only, public hosts only, size + time caps) and throws an
 * `AppError` with a user-readable message when a URL is refused.
 * Implemented by `SafeHttpTextFetcher` (adapters/http/safe-fetch.ts).
 */
export interface RemoteTextFetcher {
  fetchText(url: string): Promise<FetchedText>;
}

/** Read-only facts the agent-suggestion use case scores against. */
export interface AgentSuggestionSignals {
  /** Distinct categories of the workspace's non-rejected conventions marked as in this skill. */
  skillCategories(workspaceId: string, skillId: string): Promise<ConventionCategory[]>;
  /** Enabled agents of the workspace that do not have the skill linked yet. */
  candidateAgents(workspaceId: string, skillId: string): Promise<SuggestionAgent[]>;
}
