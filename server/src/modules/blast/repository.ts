/** blast persistence (ring 3a): the PR's files and the repo's other PRs touching them. */
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPrInputs, BlastRepositoryPort, PriorPull } from './ports.js';

export class BlastRepository implements BlastRepositoryPort {
  constructor(private readonly db: Db) {}

  async getInputs(workspaceId: string, prId: string): Promise<BlastPrInputs | undefined> {
    const [pr] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId, headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pr) return undefined;

    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(t.prFiles.path);

    return { prId: pr.id, repoId: pr.repoId, headSha: pr.headSha, changedPaths: files.map((f) => f.path) };
  }

  async getPriorPulls(
    workspaceId: string,
    repoId: string,
    excludePrId: string,
    paths: string[],
    limit: number,
  ): Promise<PriorPull[]> {
    if (paths.length === 0 || limit <= 0) return [];
    const scope = and(
      eq(t.pullRequests.workspaceId, workspaceId),
      eq(t.pullRequests.repoId, repoId),
      ne(t.pullRequests.id, excludePrId),
      inArray(t.prFiles.path, paths),
    );
    // Newest first by the latest known activity; PRs without any date (list
    // imports that never got a timestamp) rank last instead of first.
    const recency = sql`coalesce(${t.pullRequests.updatedAt}, ${t.pullRequests.openedAt})`;

    // Step 1: the top-N PR ids only (grouped by the primary key, so the order
    // columns are functionally dependent and Postgres accepts them).
    const top = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
      .where(scope)
      .groupBy(t.pullRequests.id)
      .orderBy(sql`${recency} desc nulls last`, desc(t.pullRequests.number))
      .limit(limit);
    const ids = top.map((r) => r.id);
    if (ids.length === 0) return [];

    // Step 2: bodies and overlapping paths for those PRs only.
    const rows = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        openedAt: t.pullRequests.openedAt,
        updatedAt: t.pullRequests.updatedAt,
        body: t.pullRequests.body,
        path: t.prFiles.path,
      })
      .from(t.pullRequests)
      .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
      .where(and(inArray(t.pullRequests.id, ids), inArray(t.prFiles.path, paths)));

    const byId = new Map<string, PriorPull>();
    for (const r of rows) {
      let p = byId.get(r.id);
      if (!p) {
        p = {
          number: r.number,
          title: r.title,
          author: r.author,
          openedAt: r.openedAt,
          updatedAt: r.updatedAt,
          body: r.body,
          filesOverlap: [],
        };
        byId.set(r.id, p);
      }
      p.filesOverlap.push(r.path);
    }
    for (const p of byId.values()) p.filesOverlap.sort();
    return ids.map((id) => byId.get(id)).filter((p): p is PriorPull => p !== undefined);
  }
}
