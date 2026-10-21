/**
 * project-context ports (ring 1). Plain types only: no drizzle, no fastify, no
 * `Container`. Sibling modules (agents, skills, repos) are typed structurally
 * here; the container hands the real instances in.
 */
import type { GitClient } from '@devdigest/shared';

export interface UsageCount {
  path: string;
  /** Agents attaching the path directly (any enabled state). */
  agents: number;
  /** Skills attaching the path (any enabled state). */
  skills: number;
  /** Distinct enabled agents that use the path at run time: attached directly, or through an enabled skill they link. */
  agentsUsing: number;
}

/** A local override of one document (the edited text, kept in the DB only). */
export interface OverrideDto {
  path: string;
  text: string;
  /** Git blob sha of the repository version the edit was based on. */
  sha: string;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface ProjectContextRepositoryPort {
  /** Overrides of one repo (all, or only the given paths): one query. */
  overrides(workspaceId: string, repoId: string, paths?: string[]): Promise<OverrideDto[]>;
  /** Insert or replace the override of (repo, path); `updatedAt` moves. */
  upsertOverride(
    workspaceId: string,
    repoId: string,
    input: { path: string; text: string; sha: string },
  ): Promise<OverrideDto>;
  /** true when a row was removed. */
  deleteOverride(workspaceId: string, repoId: string, path: string): Promise<boolean>;
  /** A skill's attached paths for one repo, stored order. */
  skillPaths(workspaceId: string, skillId: string, repoId: string): Promise<string[]>;
  /** Replace a skill's list for one repo (no version bump: skills have no context snapshot). */
  setSkillPaths(workspaceId: string, skillId: string, repoId: string, paths: string[]): Promise<void>;
  /** How many agents and skills attach each path in the repo. */
  usageCounts(workspaceId: string, repoId: string): Promise<UsageCount[]>;
  /** `skillId → paths` (stored order) for the given skills in one repo. */
  skillPathsFor(
    workspaceId: string,
    repoId: string,
    skillIds: string[],
  ): Promise<Record<string, string[]>>;
}

/** Structural slice of the agents repository. */
export interface AgentContextPort {
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
  contextPaths(workspaceId: string, agentId: string, repoId: string): Promise<string[]>;
  /** false = no such agent in the workspace. */
  setContext(workspaceId: string, agentId: string, repoId: string, paths: string[]): Promise<boolean>;
}

/** Structural slice of the skills repository. */
export interface SkillLookupPort {
  getById(workspaceId: string, id: string): Promise<{ id: string } | undefined>;
}

export interface RepoLookupDto {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Structural slice of the repos repository. */
export interface RepoLookupPort {
  getById(workspaceId: string, id: string): Promise<RepoLookupDto | undefined>;
}

export interface ProjectContextDeps {
  repo: ProjectContextRepositoryPort;
  agents: AgentContextPort;
  skills: SkillLookupPort;
  repos: RepoLookupPort;
  git: Pick<GitClient, 'listFiles' | 'showFile'>;
  tokenizer: { count(text: string): number };
  /** Discovery glob (env PROJECT_CONTEXT_GLOB). */
  glob: string;
}

/** Run-log sink: the executor passes `runLog.info`. */
export type ContextLog = (message: string) => void;

/** One document that went into a prompt. */
export interface ResolvedContextBlock {
  path: string;
  text: string;
  tokens: number;
  truncated: boolean;
  /** 'agent' or 'skill:<name>'. */
  source: string;
  /** The text came from a local override. */
  modified: boolean;
}

export interface ResolvedContext {
  blocks: ResolvedContextBlock[];
  /** Sum of block tokens. */
  totalTokens: number;
}

export interface ResolveForRunInput {
  repoId: string;
  /** The PR's base branch name. */
  baseBranch: string;
  agentId: string;
  /** Enabled skills linked to the agent, in link order. */
  skills: { id: string; name: string }[];
  log: ContextLog;
}
