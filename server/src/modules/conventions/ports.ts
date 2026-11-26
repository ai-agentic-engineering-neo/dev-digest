import type {
  ConventionScan,
  LLMProvider,
  RepoRef,
  Skill,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import type {
  ConventionPatch,
  ConventionRecord,
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
  getMany(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]>;
  skillNames(workspaceId: string, ids: string[]): Promise<Map<string, string>>;
  /** Delete the repo's pending rows and insert `rules`, atomically. */
  replacePending(
    workspaceId: string,
    repoId: string,
    rules: VerifiedRule[],
    scan: ConventionScan,
  ): Promise<void>;
  /**
   * Lock the row, compute the patch from its CURRENT state, write it — one
   * transaction, so a concurrent `markInSkill` is never overwritten.
   * `undefined` when the convention is not in the workspace.
   */
  update(
    workspaceId: string,
    id: string,
    makePatch: (current: ConventionRecord) => ConventionPatch,
  ): Promise<ConventionRecord | undefined>;
  /** Add `skillId` to `details.skill_ids` of these conventions (one statement). */
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

/** A merge's write to an existing skill: new body = new version. */
export interface SkillMergePatch {
  body: string;
  /** Version message ("Merged N conventions from <repo>"). */
  message: string;
  evidenceFiles: string[];
  /** The version the merge was computed on; a different one → 409. */
  expectedVersion: number;
}

/** Writes skills (the shared skills repository; 409 on a taken name or a stale version). */
export interface SkillWriter {
  insert(workspaceId: string, values: NewExtractedSkill): Promise<Skill>;
  /** `undefined` when the skill is not in the workspace. */
  update(workspaceId: string, id: string, patch: SkillMergePatch): Promise<Skill | undefined>;
}

/** Reads the merge target (outside the transaction: the model call is slow). */
export interface SkillReader {
  getById(workspaceId: string, id: string): Promise<Skill | undefined>;
}

/** The stores one skill write needs, all bound to the same transaction. */
export interface ConventionsTx {
  conventions: Pick<ConventionsStore, 'markInSkill'>;
  skills: SkillWriter;
}

/**
 * Runs `work` in ONE transaction: the skill row, its version snapshot and the
 * conventions' "in skill" mark commit together or not at all.
 */
export interface ConventionsUnitOfWork {
  run<T>(work: (tx: ConventionsTx) => Promise<T>): Promise<T>;
}

/** Token counter for the draft preview. */
export interface TokenCounter {
  count(text: string): number;
}
