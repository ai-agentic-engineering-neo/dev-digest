/**
 * What the conventions use cases need from the outside, declared here by the
 * consumer. The DI container satisfies this structurally, so nothing in this
 * module imports the composition root — the same shape as `RepoIntelDeps` and
 * `ReviewsDeps`.
 *
 * The two writer ports are narrow on purpose: a scan may create a skill and
 * link it to an agent, and that is ALL it may do to those modules. Importing
 * `modules/skills/repository.js` would be a cross-module internal import (and
 * `pnpm arch:check` refuses it); the concrete repositories on the container
 * satisfy these interfaces without knowing they exist.
 */
import type { GitClient, LLMProvider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { JobRunner } from '../../platform/jobs.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { RepoIntel } from '../repo-intel/types.js';

/** The skill row this module needs back after creating one. */
export interface CreatedSkillRow {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

/** Create a skill. `SkillsRepository.insert` satisfies this. */
export interface ConventionsSkillWriter {
  insert(
    values: {
      workspaceId: string;
      name: string;
      description: string;
      type: 'rubric' | 'convention' | 'security' | 'custom';
      source: 'manual' | 'imported_url' | 'extracted' | 'community';
      body: string;
      enabled?: boolean;
      evidenceFiles?: string[] | null;
    },
    note?: string,
  ): Promise<CreatedSkillRow>;
}

/** Link the new skill to an agent. `AgentsRepository` satisfies this. */
export interface ConventionsAgentLinker {
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
  skillIdsForAgent(agentId: string): Promise<string[]>;
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
}

/**
 * The one settings read this module needs, for `resolveFeatureModel`. The row
 * shape is restated rather than imported: `modules/settings/helpers.ts` is
 * another module's internals, and two keys are cheaper to repeat than a rule
 * to break.
 */
export interface ConventionsSettingsReader {
  listForWorkspace(workspaceId: string): Promise<{ key: string; value: unknown }[]>;
}

export interface ConventionsDeps {
  readonly db: Db;
  readonly git: GitClient;
  readonly repoIntel: RepoIntel;
  readonly tokenizer: Tokenizer;
  readonly jobs: JobRunner;
  readonly skillsRepo: ConventionsSkillWriter;
  readonly agentsRepo: ConventionsAgentLinker;
  readonly settingsRepo: ConventionsSettingsReader;
  llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
}

/** Payload of an `EXTRACT_JOB_KIND` job. */
export interface ExtractJobPayload {
  scanId: string;
  workspaceId: string;
  repoId: string;
}
