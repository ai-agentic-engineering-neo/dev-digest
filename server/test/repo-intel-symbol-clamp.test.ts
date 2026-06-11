/**
 * Regression: a pathological multi-KB symbol name must not crash the indexer.
 *
 * `symbols.name` and `references.to_symbol` are btree-indexed; Postgres rejects
 * an index row larger than ~2704 bytes. A buggy parse can emit a multi-KB
 * "identifier", and the unhandled insert rejection previously took down the
 * whole server process. We clamp such values (clampIndexedName) before insert.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { MAX_INDEXED_NAME_LEN } from '../src/db/schema/context.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('symbols/references: oversized indexed names are clamped, never crash the insert', () => {
  let pg: PgFixture;
  let repoId: string;
  let repo: RepoIntelRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'big', fullName: 'acme/big' })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('insertSymbols clamps a 5 KB name (would otherwise exceed the btree limit)', async () => {
    const hugeName = 'x'.repeat(5000); // far over the ~2704-byte btree maximum
    await expect(
      repo.insertSymbols([
        {
          repoId,
          path: 'src/big.ts',
          name: hugeName,
          kind: 'function',
          line: 1,
          endLine: 1,
          exported: false,
          signature: null,
          contentHash: 'h1',
        },
      ]),
    ).resolves.toBeUndefined();

    const [row] = await pg.handle.db
      .select({ name: t.symbols.name })
      .from(t.symbols)
      .where(eq(t.symbols.repoId, repoId));
    expect(row!.name).toHaveLength(MAX_INDEXED_NAME_LEN);
  });

  it('insertReferences clamps a 5 KB to_symbol', async () => {
    const hugeRef = 'y'.repeat(5000);
    await expect(
      repo.insertReferences([
        { repoId, fromPath: 'src/big.ts', toSymbol: hugeRef, line: 2, contentHash: 'h2' },
      ]),
    ).resolves.toBeUndefined();

    const [row] = await pg.handle.db
      .select({ s: t.references.toSymbol })
      .from(t.references)
      .where(eq(t.references.repoId, repoId));
    expect(row!.s).toHaveLength(MAX_INDEXED_NAME_LEN);
  });
});
