import type { LLMProvider, Provider, ReviewStrategy } from '@devdigest/shared';
import type { RenderableSkill } from '../_shared/skill-render.js';

/**
 * specs/12-eval-pipeline.md — local ports (finding 5 / Q2). This module needs
 * NO cross-module port for its own DB reads (`repository.ts` reads
 * `findings`/`reviews`/`pull_requests`/`pr_files`/`agents`/`agent_versions`
 * directly — `no-cross-module` says nothing about `src/db/**`, and
 * `db-only-in-repositories` explicitly permits `repository.ts`). Ports are
 * needed only for the agent's SKILL BODIES and the LLM RESOLVER — the same
 * `AgentLookup`/`SkillLookup`/`LlmResolver` trio `modules/reviews/adhoc.ts:24-58`
 * already declares, satisfied structurally by `container.agentsRepo` /
 * `container.llm` and wired in `eval/routes.ts`.
 */

/** The subset of an agent row this module needs to execute a run. Declared
 *  fully locally (not `db/rows.ts`'s `AgentRow`) so this file imports
 *  nothing from `src/db/` — `AgentsRepository.getById`'s real row satisfies
 *  it structurally. */
export interface AgentRecord {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  version: number;
}

export interface AgentLookup {
  getById(workspaceId: string, id: string): Promise<AgentRecord | null | undefined>;
  /** Required — the dashboard (AC-40) and "run all" (AC-25) both need the
   *  full enabled-agent list, not just single lookups. */
  listEnabled(workspaceId: string): Promise<AgentRecord[]>;
}

/** `AgentsRepository.enabledSkills`'s return shape satisfies this
 *  structurally (`{id, name, type, body}[]`; only `name/type/body` read). */
export interface SkillLookup {
  enabledSkills(agentId: string): Promise<RenderableSkill[]>;
}

/** Resolves an agent's configured LLM provider — `container.llm` satisfies
 *  this structurally, bound in `routes.ts`. */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;
