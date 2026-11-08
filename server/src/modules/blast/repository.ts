import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { MAX_PRIOR_SHARED_FILES, type PriorPullRow } from './domain/types.js';
import type { BlastRepositoryPort } from './ports.js';

export class BlastRepository implements BlastRepositoryPort {
  constructor(private readonly db: Db) {}

  /** Changed file paths of a PR; the join on `pull_requests.workspace_id` is the authz filter. */
  async listChangedPaths(workspaceId: string, prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.prFiles.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .orderBy(asc(t.prFiles.path));
    return [...new Set(rows.map((r) => r.path))];
  }

  /**
   * Earlier PRs (lower number) of the SAME repo that touched at least one of this PR's paths, in ONE
   * query: pr_files self-join on `path`. Both PR rows are filtered by `workspace_id` (no base guard
   * exists — scoping is per query). `total` is the number of matching PRs before `limit`.
   */
  async listPriorPulls(
    workspaceId: string,
    prId: string,
    limit: number,
  ): Promise<{ total: number; rows: PriorPullRow[] }> {
    const cur = alias(t.pullRequests, 'cur');
    const curFiles = alias(t.prFiles, 'cur_files');
    const prior = alias(t.pullRequests, 'prior');
    const priorFiles = alias(t.prFiles, 'prior_files');

    const rows = await this.db
      .select({
        id: prior.id,
        number: prior.number,
        title: prior.title,
        author: prior.author,
        status: prior.status,
        updatedAt: prior.updatedAt,
        openedAt: prior.openedAt,
        sharedCount: sql<number>`count(distinct ${priorFiles.path})`.mapWith(Number),
        // COLLATE "C": byte order, independent of the database locale (en_US would put `AGENTS.md` before `.claude/…`).
        sharedFiles: sql<string[]>`(array_agg(distinct ${priorFiles.path} collate "C" order by ${priorFiles.path} collate "C"))[1:${sql.raw(
          String(MAX_PRIOR_SHARED_FILES),
        )}]`,
        total: sql<number>`count(*) over ()`.mapWith(Number),
      })
      .from(curFiles)
      .innerJoin(cur, and(eq(cur.id, curFiles.prId), eq(cur.workspaceId, workspaceId)))
      .innerJoin(
        prior,
        and(eq(prior.repoId, cur.repoId), eq(prior.workspaceId, workspaceId), lt(prior.number, cur.number)),
      )
      .innerJoin(priorFiles, and(eq(priorFiles.prId, prior.id), eq(priorFiles.path, curFiles.path)))
      .where(eq(curFiles.prId, prId))
      .groupBy(prior.id)
      .orderBy(desc(prior.number))
      .limit(limit);

    return {
      total: rows[0]?.total ?? 0,
      rows: rows.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        status: r.status,
        updatedAt: r.updatedAt ?? r.openedAt,
        sharedCount: r.sharedCount,
        sharedFiles: r.sharedFiles ?? [],
      })),
    };
  }
}
