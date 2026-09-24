/**
 * Ports of the conventions use cases. Infrastructure implements the store, the
 * repo lookup and the clone reader; the composition root adapts repo-intel,
 * settings + LLM, the JobRunner, skills and agents onto the rest.
 */
import type {
  AgentSkillLink,
  ChatMessage,
  Convention,
  ConventionScan,
  ConventionStatus,
  ConventionCategory,
  CreateSkillInput,
  Skill,
} from '@devdigest/shared';
import type { ConventionExtraction } from '../domain/extraction.js';
import type { KeptConvention, ScanSummary } from '../domain/types.js';

export interface RepoRef {
  id: string;
  fullName: string;
  name: string;
  clonePath: string | null;
}

/** A repo of the workspace (undefined = unknown or foreign → 404). */
export interface RepoLookup {
  get(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
}

/** Read-only access to a clone on disk. */
export interface CloneFiles {
  /** Repo-relative POSIX paths of regular files (bounded walk, skips dependency/build dirs). */
  list(root: string): Promise<string[]>;
  /**
   * Text of `path` when it is a regular file that resolves INSIDE `root` (symlinks
   * included) and is small enough; null otherwise. Never throws for a bad path.
   */
  read(root: string, path: string): Promise<string | null>;
}

/** repo-intel ranking (empty when the repo is not indexed). */
export interface SampleRanker {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

export interface ProposalResult {
  data: ConventionExtraction;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/** The workspace's `conventions` feature model (throws when its key is missing). */
export interface ConventionModel {
  propose(workspaceId: string, messages: ChatMessage[], signal: AbortSignal): Promise<ProposalResult>;
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
  edited?: boolean;
}

export interface ConventionsStore {
  latestScan(repoId: string): Promise<ConventionScan | undefined>;
  /** Every rule of the repo: accepted → pending → rejected, then confidence desc. */
  list(repoId: string): Promise<Convention[]>;
  find(workspaceId: string, id: string): Promise<Convention | undefined>;
  /** Mark `running` scans started before `before` as failed (crash / restart). */
  failStaleScans(repoId: string, before: Date): Promise<void>;
  /** Insert a running scan; a running one already → ConflictError('scan_running'). */
  startScan(workspaceId: string, repoId: string): Promise<ConventionScan>;
  failScan(scanId: string, error: string, summary?: Partial<ScanSummary>): Promise<void>;
  /**
   * One transaction: drop the repo's pending, unedited rules, insert `kept` as
   * pending, and finish the scan as `done` with `summary`.
   */
  completeScan(scan: { id: string; workspaceId: string; repoId: string }, kept: KeptConvention[], summary: ScanSummary): Promise<void>;
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<Convention | undefined>;
  /** Point the given rules of the repo at the skill they were merged into. */
  setSkill(repoId: string, ids: string[], skillId: string): Promise<void>;
}

export interface ExtractJobPayload {
  scanId: string;
  workspaceId: string;
  repoId: string;
}

/** Schedules `runScan` in the background (the JobRunner). */
export interface ScanQueue {
  enqueue(payload: ExtractJobPayload): Promise<void>;
}

/** Skills use case (source='extracted', v1 snapshotted). */
export interface SkillCreator {
  createExtracted(
    workspaceId: string,
    repoFullName: string,
    input: Omit<CreateSkillInput, 'source' | 'source_ref'> & { enabled: boolean },
  ): Promise<Skill>;
}

export interface AgentRef {
  id: string;
  name: string;
  enabled: boolean;
}

/** Agents use cases (link = append, bumps the agent version). */
export interface AgentLinker {
  get(workspaceId: string, agentId: string): Promise<AgentRef | undefined>;
  linkSkill(workspaceId: string, agentId: string, skillId: string): Promise<AgentSkillLink[] | undefined>;
}

/** Wall clock (injectable for tests). */
export type Clock = () => Date;
