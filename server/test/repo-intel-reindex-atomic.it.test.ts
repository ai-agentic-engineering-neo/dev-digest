/**
 * DB-1 stopgap: wiping a repo's index also removes its `repo_index_state` row,
 * so an interrupted full re-index reads "never indexed" and runs in full next
 * time, instead of leaving an empty index that still reads "full".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('deleteAllForRepo also clears the index state', () => {
  let pg: PgFixture;
  let repoId: string;
  let repo: RepoIntelRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'idx', fullName: 'acme/idx' })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('removes symbols, references and the repo_index_state row', async () => {
    await repo.insertSymbols([
      {
        repoId,
        path: 'src/a.ts',
        name: 'a',
        kind: 'function',
        line: 1,
        endLine: 2,
        exported: true,
        signature: null,
        contentHash: 'h',
      },
    ]);
    await repo.insertReferences([
      { repoId, fromPath: 'src/b.ts', toSymbol: 'a', line: 3, contentHash: 'h' },
    ]);
    await repo.upsertIndexState({
      repoId,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      status: 'full',
      filesIndexed: 1,
      filesSkipped: 0,
      stats: {},
    });
    expect(await repo.tryGetIndexState(repoId)).not.toBeNull();

    await repo.deleteAllForRepo(repoId);

    const db = pg.handle.db;
    expect(await db.select().from(t.symbols).where(eq(t.symbols.repoId, repoId))).toHaveLength(0);
    expect(
      await db.select().from(t.references).where(eq(t.references.repoId, repoId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(t.repoIndexState).where(eq(t.repoIndexState.repoId, repoId)),
    ).toHaveLength(0);
  });
});
