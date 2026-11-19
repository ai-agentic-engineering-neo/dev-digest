/**
 * `RepoIntelService.getBlastRadius`'s persistent path (v3 symbol-edge graph via
 * `getBlastGraph`) — end-to-end against a real Postgres index, covering the
 * three fixes from specs/07-blast-radius.md, re-expressed on v3 rows (plan 19
 * / P2-B, AC-39: `resolveReferences` is gone, edges are seeded directly):
 *
 *   1. declaring-file exclusion — a reference that resolves to its OWN
 *      declaring file must not count as a "caller".
 *   2. per-symbol caller cap — `MAX_CALLERS_PER_SYMBOL` applies PER changed
 *      symbol, not once globally, so a hot symbol can't starve another
 *      changed symbol's caller slots.
 *   3. multi-hop endpoint/cron impact — files reachable through the reverse
 *      symbol-edge graph contribute facts even with zero direct callers of the
 *      changed symbol, the walk stops at an entry point and at the requested
 *      depth bound.
 *
 * Docker-gated, self-skips without a reachable daemon (see helpers/pg.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { INDEXER_VERSION, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { RepoIntelDeps } from '../src/modules/repo-intel/deps.js';
import type { SymbolEdgeRow } from '../src/modules/repo-intel/graph/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('RepoIntelService.getBlastRadius — persistent-index fixes', () => {
  let pg: PgFixture;
  let repo: RepoIntelRepository;
  let service: RepoIntelService;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new RepoIntelRepository(pg.handle.db);
    service = new RepoIntelService(repo, { repoIntelEnabled: true } as unknown as RepoIntelDeps);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo(name: string): Promise<string> {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return r!.id;
  }

  async function markIndexed(repoId: string): Promise<void> {
    await repo.upsertIndexState({
      repoId,
      lastIndexedSha: 'sha1',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 10,
      filesSkipped: 0,
      stats: {},
    });
  }

  const edge = (
    from: [string, string],
    to: [string, string],
    line = 1,
  ): SymbolEdgeRow => ({
    fromPath: from[0],
    fromName: from[1],
    toPath: to[0],
    toName: to[1],
    kind: 'call',
    confidence: 'exact',
    line,
  });

  it('excludes a reference that resolves to its own declaring file (not just any changed file)', async () => {
    const repoId = await makeRepo('declfile-exclusion');
    const declFile = 'src/utils/helper.ts';
    const callerFile = 'src/api/route.ts';

    await repo.insertSymbols([
      {
        repoId,
        path: declFile,
        name: 'helper',
        kind: 'function',
        line: 1,
        endLine: 3,
        exported: true,
        signature: 'function helper()',
        contentHash: 'h1',
      },
    ]);

    // v3 edges: one same-file usage (must be excluded) and one real cross-file caller.
    await repo.replaceGraphRows(repoId, {
      imports: [],
      exports: [],
      edges: [
        edge([declFile, 'internalUser'], [declFile, 'helper'], 5),
        edge([callerFile, 'handler'], [declFile, 'helper'], 10),
      ],
    });

    await repo.replaceFileRank(repoId, [
      { filePath: declFile, pagerank: 1, hotness: 0, rank: 1, percentile: 50 },
      { filePath: callerFile, pagerank: 2, hotness: 0, rank: 2, percentile: 60 },
    ]);

    await markIndexed(repoId);

    const result = await service.getBlastRadius(repoId, [declFile]);

    expect(result.degraded).toBeFalsy();
    expect(result.callers).toHaveLength(1);
    expect(result.callers[0]!.file).toBe(callerFile);
    expect(result.callers[0]!.viaSymbol).toBe('helper');
  });

  it('caps callers PER changed symbol, so a hot symbol cannot starve another symbol of slots', async () => {
    const repoId = await makeRepo('per-symbol-cap');
    const declFile = 'src/core/multi.ts';

    await repo.insertSymbols([
      {
        repoId,
        path: declFile,
        name: 'alpha',
        kind: 'function',
        line: 1,
        endLine: 2,
        exported: true,
        signature: 'function alpha()',
        contentHash: 'h1',
      },
      {
        repoId,
        path: declFile,
        name: 'beta',
        kind: 'function',
        line: 4,
        endLine: 5,
        exported: true,
        signature: 'function beta()',
        contentHash: 'h2',
      },
    ]);

    const alphaCallerCount = MAX_CALLERS_PER_SYMBOL + 5; // deliberately over the cap
    const alphaCallerFiles = Array.from(
      { length: alphaCallerCount },
      (_, i) => `src/callers/a${i}.ts`,
    );
    const betaCallerFile = 'src/callers/buser.ts';

    await repo.replaceGraphRows(repoId, {
      imports: [],
      exports: [],
      edges: [
        ...alphaCallerFiles.map((f) => edge([f, 'run'], [declFile, 'alpha'])),
        edge([betaCallerFile, 'run'], [declFile, 'beta']),
      ],
    });

    // alpha callers rank HIGH (descending), beta's single caller ranks LOWEST
    // of all — under the OLD global top-N-by-rank cap, beta's caller would be
    // starved out entirely by alpha's many higher-ranked callers.
    await repo.replaceFileRank(repoId, [
      ...alphaCallerFiles.map((f, i) => ({
        filePath: f,
        pagerank: alphaCallerCount - i,
        hotness: 0,
        rank: alphaCallerCount - i,
        percentile: 90,
      })),
      { filePath: betaCallerFile, pagerank: 0, hotness: 0, rank: 0, percentile: 1 },
    ]);

    await markIndexed(repoId);

    const result = await service.getBlastRadius(repoId, [declFile]);

    expect(result.degraded).toBeFalsy();
    const alphaCallers = result.callers.filter((c) => c.viaSymbol === 'alpha');
    const betaCallers = result.callers.filter((c) => c.viaSymbol === 'beta');
    expect(alphaCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(betaCallers).toHaveLength(1); // NOT starved out by alpha's hot fan-out
    expect(betaCallers[0]!.file).toBe(betaCallerFile);
  });

  it('walks the reverse symbol-edge graph for endpoint/cron impact even with a single direct caller, stops at an entry point and at the depth bound', async () => {
    const repoId = await makeRepo('reverse-import-impact');
    const changed = 'src/features/a.ts';
    const oneHop = 'src/features/b.ts';
    const twoHop = 'src/features/c.ts'; // endpoint file: the walk stops here
    const threeHop = 'src/features/d.ts'; // behind the entry point — must NOT be reached

    await repo.insertSymbols([
      { repoId, path: changed, name: 'fnA', kind: 'function', line: 1, endLine: 3, exported: true, signature: 'function fnA()', contentHash: 'h1' },
    ]);
    // Chain: a.fnA <- b.fnB <- c.fnC <- d.fnD
    await repo.replaceGraphRows(repoId, {
      imports: [],
      exports: [],
      edges: [
        edge([oneHop, 'fnB'], [changed, 'fnA']),
        edge([twoHop, 'fnC'], [oneHop, 'fnB']),
        edge([threeHop, 'fnD'], [twoHop, 'fnC']),
      ],
    });
    await repo.replaceFileFacts(repoId, [
      { filePath: twoHop, endpoints: ['GET /impacted'], crons: [] },
      { filePath: threeHop, endpoints: ['GET /too-far'], crons: [] },
    ]);

    await markIndexed(repoId);

    const result = await service.getBlastRadius(repoId, [changed]);

    expect(result.degraded).toBeFalsy();
    expect(result.changedSymbols.map((s) => s.name)).toEqual(['fnA']);
    expect(result.callers.map((c) => c.file)).toEqual([oneHop]);
    expect(result.impactedEndpoints).toContain('GET /impacted');
    expect(result.impactedEndpoints).not.toContain('GET /too-far');
    expect(result.factsByFile?.[twoHop]?.endpoints).toEqual(['GET /impacted']);
    expect(result.factsByFile?.[threeHop]).toBeUndefined();

    // Depth bound: one hop does not reach the endpoint file at all.
    const shallow = await service.getBlastRadius(repoId, [changed], { depth: 1 });
    expect(shallow.impactedEndpoints).not.toContain('GET /impacted');
    expect(shallow.callers.map((c) => c.file)).toEqual([oneHop]);
  });
});
