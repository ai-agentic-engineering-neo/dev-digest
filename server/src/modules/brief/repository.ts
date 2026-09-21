import { and, eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `pr_brief` (+ the read-only slices of `pull_requests`/`repos`/`pr_files`
 * this module needs) — the ONLY file in this module that imports
 * `src/db/**` (`db-only-in-repositories`).
 */

export interface BriefPullRow {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  base: string;
  additions: number;
  deletions: number;
  filesCount: number;
  intentSummary: string | null;
  intentInScope: string[] | null;
  intentOutOfScope: string[] | null;
  intentContextGaps: string[] | null;
  intentSignals: string[] | null;
  intentResolvedAt: Date | null;
}

export interface BriefRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface BriefPrFileRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** One stored brief (`pr_brief`) — D8's redesigned-in-place row shape. */
export interface BriefRow {
  prId: string;
  json: PrBrief;
  generatedAt: Date;
  headSha: string;
  indexSha: string | null;
  indexStatus: string | null;
  indexerVersion: number | null;
  intentResolvedAt: Date | null;
  provider: string | null;
  model: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  droppedInputs: number;
}

export interface UpsertBriefInput {
  prId: string;
  json: PrBrief;
  headSha: string;
  indexSha: string | null;
  indexStatus: string | null;
  indexerVersion: number | null;
  intentResolvedAt: Date | null;
  provider: string | null;
  model: string;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  droppedInputs: number;
}

export class BriefRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped — AC-44: a PR in another workspace resolves to
   *  `undefined` here, before any `pr_brief` row is ever read. */
  async getPull(workspaceId: string, prId: string): Promise<BriefPullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.id,
      repoId: row.repoId,
      number: row.number,
      title: row.title,
      body: row.body,
      headSha: row.headSha,
      base: row.base,
      additions: row.additions,
      deletions: row.deletions,
      filesCount: row.filesCount,
      intentSummary: row.intentSummary,
      intentInScope: row.intentInScope ?? null,
      intentOutOfScope: row.intentOutOfScope ?? null,
      intentContextGaps: row.intentContextGaps ?? null,
      intentSignals: row.intentSignals ?? null,
      intentResolvedAt: row.intentResolvedAt,
    };
  }

  async getRepo(repoId: string): Promise<BriefRepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    if (!row) return undefined;
    return { id: row.id, owner: row.owner, name: row.name, fullName: row.fullName, clonePath: row.clonePath };
  }

  /** Q2: the persisted rows — diff stats and hunk source, never a re-fetch. */
  async getPrFiles(prId: string): Promise<BriefPrFileRow[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => ({ path: r.path, additions: r.additions, deletions: r.deletions, patch: r.patch }));
  }

  async getBrief(prId: string): Promise<BriefRow | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return undefined;
    return {
      prId: row.prId,
      json: row.json as PrBrief,
      generatedAt: row.generatedAt,
      headSha: row.headSha,
      indexSha: row.indexSha,
      indexStatus: row.indexStatus,
      indexerVersion: row.indexerVersion,
      intentResolvedAt: row.intentResolvedAt,
      provider: row.provider,
      model: row.model,
      attempts: row.attempts,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      droppedInputs: row.droppedInputs,
    };
  }

  /** Insert-or-replace the PR's ONE current brief (PK = prId). Called only on
   *  a successful generation (AC-28: a failure writes nothing). */
  async upsertBrief(input: UpsertBriefInput): Promise<void> {
    const generatedAt = new Date();
    const values = {
      prId: input.prId,
      json: input.json,
      generatedAt,
      headSha: input.headSha,
      indexSha: input.indexSha,
      indexStatus: input.indexStatus,
      indexerVersion: input.indexerVersion,
      intentResolvedAt: input.intentResolvedAt,
      provider: input.provider,
      model: input.model,
      attempts: input.attempts,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd,
      droppedInputs: input.droppedInputs,
    };
    await this.db
      .insert(t.prBrief)
      .values(values)
      .onConflictDoUpdate({ target: t.prBrief.prId, set: values });
  }
}
