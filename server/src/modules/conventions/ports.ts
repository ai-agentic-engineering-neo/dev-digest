import type {
  ConventionCategory,
  ConventionStatus,
  LLMProvider,
  RepoRef,
} from '@devdigest/shared';

/** Read model the conventions service works with — NOT a Drizzle row. */
export interface ConventionRecord {
  id: string;
  workspaceId: string;
  repoId: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number | null;
  evidenceSnippet: string;
  confidence: number;
  status: ConventionStatus;
}

export interface ScanRecord {
  id: string;
  repoId: string;
  status: 'running' | 'done' | 'failed';
  filesSampled: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export type NewConvention = Pick<
  ConventionRecord,
  'category' | 'rule' | 'evidencePath' | 'evidenceLine' | 'evidenceSnippet' | 'confidence'
>;

export type ConventionPatch = Partial<
  Pick<ConventionRecord, 'rule' | 'category' | 'evidenceSnippet' | 'status'>
>;

export interface ConventionStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoBasics | undefined>;
  latestScan(workspaceId: string, repoId: string): Promise<ScanRecord | undefined>;
  createScan(workspaceId: string, repoId: string): Promise<ScanRecord>;
  failScan(scanId: string, error: string): Promise<void>;
  /**
   * Re-scan semantics: deletes EVERY candidate of the repo, inserts the new
   * set and marks the scan done — one transaction.
   */
  completeScan(
    workspaceId: string,
    repoId: string,
    scanId: string,
    filesSampled: number,
    items: NewConvention[],
  ): Promise<void>;
  list(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRecord | undefined>;
  /** Sets `status` on all PENDING candidates of the repo; returns how many changed. */
  resolvePending(workspaceId: string, repoId: string, status: 'accepted' | 'rejected'): Promise<number>;
}

/** Ranked file sample — the repo-intel facade satisfies it. */
export interface SampleSource {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/** Working-tree file reads from the clone — the GitClient satisfies it. */
export interface RepoFiles {
  readFile(repo: RepoRef, path: string): Promise<string>;
}

/** The workspace's chosen provider + model for the `conventions` feature. */
export type ResolveModel = (workspaceId: string) => Promise<{ llm: LLMProvider; model: string }>;

export interface Logger {
  error(obj: object, msg: string): void;
}
