import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';
import type { RunCostRow } from './cost.js';

/**
 * Pulls module — domain types and ports (rings 1–2). No Drizzle, no Fastify:
 * the service depends only on these; `repository.ts` implements the port.
 */

/** The repo a PR belongs to — just what the service needs to call GitHub. */
export interface PullRepo {
  id: string;
  owner: string;
  name: string;
}

/** A persisted pull request (domain shape, not the DB row). */
export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state as persisted (open/merged/closed). */
  status: string;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface PullsRepositoryPort {
  getRepo(workspaceId: string, repoId: string): Promise<PullRepo | undefined>;
  getById(workspaceId: string, id: string): Promise<PullRecord | undefined>;
  getByNumber(workspaceId: string, repoId: string, number: number): Promise<PullRecord | undefined>;
  listByRepo(repoId: string): Promise<PullRecord[]>;
  /** Idempotent multi-row import of GitHub's PR list. */
  upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void>;
  updateDiffStats(prId: string, stats: DiffStats): Promise<void>;
  /** Atomically replace files/commits and refresh body + diff stats. */
  replaceDetail(prId: string, detail: PrDetail): Promise<void>;
  /** The persisted detail (offline fallback). */
  getPersistedDetail(prId: string): Promise<PrDetail | undefined>;
  reviewScoresNewestFirst(prIds: string[]): Promise<{ prId: string; score: number | null }[]>;
  runCostsNewestFirst(prIds: string[]): Promise<RunCostRow[]>;
}

/** Minimal pino-compatible logger the service needs. */
export interface PullsLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface PullsServiceDeps {
  pulls: PullsRepositoryPort;
  /** Resolves the GitHub client; rejects when no token is configured / offline. */
  github: () => Promise<GitHubClient>;
  log: PullsLogger;
}
