import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { GraphReadRepository } from '../src/modules/repo-intel/graph-read.repository.js';
import { GraphReadService } from '../src/modules/repo-intel/graph-read.service.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { NotFoundError } from '../src/platform/errors.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GraphReadService over real Postgres (specs/18 P4-A)', () => {
  let pg: PgFixture;
  let repoId: string;
  let svc: GraphReadService;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'g', fullName: 'acme/g' })
      .returning();
    repoId = r!.id;
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'sha1',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
    });
    const sym = (path: string, name: string, line: number) => ({
      repoId, path, name, kind: 'function', line, endLine: line + 1, exported: true,
      signature: null, contentHash: 'h',
    });
    await db.insert(t.symbols).values([
      sym('src/a.ts', 'foo', 1), sym('src/a.ts', 'bar', 5), sym('src/b.ts', 'baz', 1),
    ]);
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/a.ts', toFile: 'src/b.ts' },
      { repoId, fromFile: 'src/b.ts', toFile: 'src/a.ts' },
    ]);
    await db.insert(t.fileRank).values([
      { repoId, filePath: 'src/a.ts', pagerank: 0.6, hotness: 0, rank: 0.6, percentile: 90 },
    ]);
    await db.insert(t.symbolEdges).values([
      { repoId, fromPath: 'src/b.ts', fromName: 'baz', toPath: 'src/a.ts', toName: 'foo', kind: 'call', confidence: 'exact', line: 3 },
    ]);
    const imp = (idx: number, spec: string, reason: 'missing' | 'external' | null) => ({
      repoId, fromFile: 'src/a.ts', idx, localName: `l${idx}`, importedName: `n${idx}`,
      specifier: spec, kind: 'static' as const, line: idx + 1, unresolvedReason: reason,
    });
    await db.insert(t.fileImports).values([
      imp(0, './gone', 'missing'), imp(1, 'react', 'external'), imp(2, './b', null),
    ]);
    svc = new GraphReadService(new GraphReadRepository(db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('overview unions symbols/rank/edges into files and detects the cycle', async () => {
    const g = await svc.getGraph(repoId, {});
    if (g.state !== 'ready') throw new Error('expected ready');
    expect(g.cycles.total).toBe(1);
    // AC-47: the overview groups by directory; files come via `dir=` drill-down.
    expect(g.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['src']));
    expect(g.index.indexedSha).toBe('sha1');
  });

  it('file focus returns symbols and the symbol edge; unknown file/dir => NotFoundError', async () => {
    const g = await svc.getGraph(repoId, { file: 'src/a.ts' });
    if (g.state !== 'ready') throw new Error('expected ready');
    expect(g.edges).toHaveLength(1);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['src/a.ts#bar', 'src/a.ts#foo', 'src/b.ts#baz']);
    await expect(svc.getGraph(repoId, { file: 'src/zzz.ts' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.getGraph(repoId, { dir: 'zzz' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('unresolved excludes external/builtin and resolved rows', async () => {
    const u = await svc.listUnresolved(repoId, { page: 1, pageSize: 50 });
    if (u.state !== 'ready') throw new Error('expected ready');
    expect(u.total).toBe(1);
    expect(u.items[0]).toMatchObject({ specifier: './gone', reason: 'missing' });
  });

  it('symbols page carries per-symbol degrees', async () => {
    const s = await svc.listSymbols(repoId, { file: 'src/a.ts', page: 1 });
    if (s.state !== 'ready') throw new Error('expected ready');
    expect(s.items.find((x) => x.name === 'foo')).toMatchObject({ inCount: 1, outCount: 0 });
  });

  it('reads have no side effects: stale version reports reindexing without writing', async () => {
    const db = pg.handle.db;
    await db.update(t.repoIndexState).set({ indexerVersion: INDEXER_VERSION - 1 });
    const g = await svc.getGraph(repoId, {});
    expect(g.state).toBe('reindexing');
    const [row] = await db.select().from(t.repoIndexState);
    expect(row!.reindexState).toBeNull();
    expect(row!.indexerVersion).toBe(INDEXER_VERSION - 1);
    const jobs = await db.select().from(t.jobs);
    expect(jobs).toHaveLength(0);
  });
});
