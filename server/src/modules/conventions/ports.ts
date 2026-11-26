import type { LLMProvider, RepoRef, Skill, SkillSource, SkillType } from '@devdigest/shared';
import type {
  ConventionPatch,
  ConventionRecord,
  ConventionScanMeta,
  RepoRefRecord,
  VerifiedRule,
} from './helpers.js';

/**
 * Ports the Conventions Extractor service depends on (onion §5): explicit
 * interfaces in domain / contract types, owned here. Implementations
 * (ConventionsRepository, the shared SkillsRepository, the repo-intel facade,
 * the git adapter) satisfy them structurally and are wired in `routes.ts`.
 */

/** Storage for conventions (implemented by ConventionsRepository). */
export interface ConventionsStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoRefRecord | undefined>;
  listForRepo(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  getById(workspaceId: string, id: string): Promise<ConventionRecord | undefined>;
  getMany(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]>;
  skillNames(workspaceId: string, ids: string[]): Promise<Map<string, string>>;
  /** Delete the repo's pending rows and insert `rules`, atomically. */
  replacePending(
    workspaceId: string,
    repoId: string,
    rules: VerifiedRule[],
    scan: ConventionScanMeta,
  ): Promise<void>;
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRecord | undefined>;
  markInSkill(workspaceId: string, ids: string[], skillId: string): Promise<void>;
}

/** Rank-ordered source files to sample (the repo-intel facade). */
export interface ConventionSampler {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/** Read access to the repo's clone (the git adapter). */
export interface CloneReader {
  readFile(repo: RepoRef, path: string): Promise<string>;
  currentHead(repo: RepoRef): Promise<string>;
}

/** The model configured for the `conventions` feature in this workspace. */
export interface ExtractionModelResolver {
  resolve(workspaceId: string): Promise<{ llm: LLMProvider; model: string }>;
}

/** A new skill made from accepted conventions. */
export interface NewExtractedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  source: SkillSource;
  evidenceFiles: string[];
}

/** Writes that skill (the shared skills repository; 409 when the name is taken). */
export interface SkillWriter {
  insert(workspaceId: string, values: NewExtractedSkill): Promise<Skill>;
}

/** Token counter for the draft preview. */
export interface TokenCounter {
  count(text: string): number;
}
