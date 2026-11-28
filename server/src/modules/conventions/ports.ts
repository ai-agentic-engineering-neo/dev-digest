import type {
  ConventionStatus,
  FeatureModelChoice,
  LLMProvider,
  Provider,
  Repo,
  Skill,
  SkillInput,
} from '@devdigest/shared';
import type { StoredConvention, VerifiedCandidate } from './domain.js';

/**
 * M2 Conventions Extractor: what the service needs from outside. Wired in
 * `platform/container.ts`; tests pass in-memory fakes.
 */

export type { StoredConvention, VerifiedCandidate };

/** The last extraction run of a repo. */
export interface ScanInfo {
  sampleCount: number;
  at: Date;
}

/** Persistence for convention candidates. Workspace-scoped. */
export interface ConventionStore {
  /** The repo's candidates, highest confidence first. */
  listByRepo(workspaceId: string, repoId: string): Promise<StoredConvention[]>;
  getById(workspaceId: string, id: string): Promise<StoredConvention | undefined>;
  /**
   * Replace the repo's pending and rejected candidates with `fresh`, keeping
   * accepted ones, in one transaction.
   */
  replaceUndecided(workspaceId: string, repoId: string, fresh: VerifiedCandidate[]): Promise<void>;
  update(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string },
  ): Promise<StoredConvention | undefined>;
}

/** Remembers the sample size of the last scan per repo (not worth a table). */
export interface ScanLog {
  get(repoId: string): ScanInfo | undefined;
  set(repoId: string, info: ScanInfo): void;
}

/** Reads a repo by id (the repos module's store). */
export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
}

/** Ranked source paths for a repo, tests/configs/migrations excluded (repo-intel facade). */
export type ConventionSampler = (repoId: string, n: number) => Promise<string[]>;

/** Reads a file inside a clone; null when missing, a directory, too large or escaping the clone. */
export type CloneFileReader = (clonePath: string, file: string) => Promise<string | null>;

/** The LLM for a provider. A resolver, not an instance, so secret changes take effect. */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;

/** The workspace's model for the `conventions` feature (Settings, else the registry default). */
export type FeatureModelResolver = (workspaceId: string) => Promise<FeatureModelChoice>;

/** Saves a skill (the skills service's create with source `extracted`). */
export type ExtractedSkillWriter = (
  workspaceId: string,
  input: SkillInput,
  evidenceFiles: string[],
) => Promise<Skill>;
