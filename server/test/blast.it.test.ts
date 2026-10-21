/** blast repository: PR inputs and prior PRs on the same files (Testcontainers pg). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { BlastRepository } from '../src/modules/blast/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('blast repository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast', fullName: 'acme/blast' })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function newPr(files: string[], over: Partial<typeof t.pullRequests.$inferInsert> = {}) {
    const n = ++seq;
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: n,
        title: `PR ${n}`,
        author: 'a',
        branch: `b${n}`,
        base: 'main',
        headSha: `sha${n}`,
        status: 'merged',
        updatedAt: new Date(Date.UTC(2026, 0, n)),
        ...over,
      })
      .returning();
    if (files.length)
      await db()
        .insert(t.prFiles)
        .values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    return pr!;
  }

  it('getInputs returns the repo, head and sorted file paths; undefined outside the workspace', async () => {
    const repo = new BlastRepository(db());
    const pr = await newPr(['src/z.ts', 'src/a.ts']);
    expect(await repo.getInputs(workspaceId, pr.id)).toEqual({
      prId: pr.id,
      repoId,
      headSha: pr.headSha,
      changedPaths: ['src/a.ts', 'src/z.ts'],
    });
    expect(await repo.getInputs('00000000-0000-4000-8000-000000000000', pr.id)).toBeUndefined();
  });

  it('getPriorPulls lists other PRs touching the paths, newest first, with their overlap, capped', async () => {
    const repo = new BlastRepository(db());
    const current = await newPr(['src/api.ts', 'src/redis.ts']);
    const old = await newPr(['src/api.ts'], { body: 'Split the API.\n\nDetails.' });
    const newer = await newPr(['src/api.ts', 'src/redis.ts', 'README.md']);
    await newPr(['docs/other.md']); // no overlap
    // A list-imported PR without any timestamp ranks last, not first.
    const undated = await newPr(['src/api.ts'], { updatedAt: null, openedAt: null });
    // Another repo in the same workspace must never leak in.
    const [other] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `other-${seq}`, fullName: `acme/other-${seq}` })
      .returning();
    const [foreign] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: other!.id, number: 1, title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 's' })
      .returning();
    await db().insert(t.prFiles).values({ prId: foreign!.id, path: 'src/api.ts' });

    const prior = await repo.getPriorPulls(workspaceId, repoId, current.id, ['src/api.ts', 'src/redis.ts'], 5);
    expect(prior.map((p) => p.number)).toEqual([newer.number, old.number, undated.number]);
    expect(prior[0]!.filesOverlap).toEqual(['src/api.ts', 'src/redis.ts']);
    expect(prior[1]!.filesOverlap).toEqual(['src/api.ts']);
    expect(prior[1]!.body).toBe('Split the API.\n\nDetails.');

    const one = await repo.getPriorPulls(workspaceId, repoId, current.id, ['src/api.ts'], 1);
    expect(one.map((p) => p.number)).toEqual([newer.number]);
    expect(await repo.getPriorPulls(workspaceId, repoId, current.id, [], 5)).toEqual([]);
  });
});
