/**
 * `RepoIntelService.getBlastRadius`'s persistent path (`tryPersistentBlast`) —
 * end-to-end against a real Postgres index, covering the three fixes from
 * specs/07-blast-radius.md:
 *
 *   1. declaring-file exclusion — a reference that resolves to its OWN
 *      declaring file must not count as a "caller".
 *   2. per-symbol caller cap — `MAX_CALLERS_PER_SYMBOL` applies PER changed
 *      symbol, not once globally, so a hot symbol can't starve another
 *      changed symbol's caller slots.
 *   3. 2-hop reverse-import-graph endpoint/cron impact — files reachable via
 *      the reverse import graph (up to `BFS_DEPTH` hops) contribute facts
 *      even with zero direct symbol-callers, and the walk stops at the depth
 *      bound.
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
import type { Container } from '../src/platform/container.js';

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
    const container = {
      config: { repoIntelEnabled: true },
      db: pg.handle.db,
    } as unknown as Container;
    service = new RepoIntelService(container);
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

    // Force a same-file reference to resolve its OWN declFile by giving it a
    // self-edge — `resolveReferences` only resolves a reference through an
    // import edge, so this is the deterministic way to construct the case the
    // fix targets, regardless of whether a real import graph would emit one.
    await repo.replaceEdges(repoId, [
      { fromFile: declFile, toFile: declFile },
      { fromFile: callerFile, toFile: declFile },
    ]);

    await repo.insertReferences([
      { repoId, fromPath: declFile, toSymbol: 'helper', line: 5, contentHash: 'r1' }, // same-file — must be excluded
      { repoId, fromPath: callerFile, toSymbol: 'helper', line: 10, contentHash: 'r2' }, // real caller — must be kept
    ]);

    await repo.resolveReferences(repoId, { reset: true });

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

    await repo.replaceEdges(repoId, [
      ...alphaCallerFiles.map((f) => ({ fromFile: f, toFile: declFile })),
      { fromFile: betaCallerFile, toFile: declFile },
    ]);

    await repo.insertReferences([
      ...alphaCallerFiles.map((f, i) => ({
        repoId,
        fromPath: f,
        toSymbol: 'alpha',
        line: 1,
        contentHash: `ra${i}`,
      })),
      { repoId, fromPath: betaCallerFile, toSymbol: 'beta', line: 1, contentHash: 'rb' },
    ]);

    await repo.resolveReferences(repoId, { reset: true });

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

  it('walks the reverse import graph 2 hops for endpoint/cron impact, even with zero direct callers, and stops at the depth bound', async () => {
    const repoId = await makeRepo('reverse-import-impact');
    const changed = 'src/features/a.ts';
    const oneHop = 'src/features/b.ts';
    const twoHop = 'src/features/c.ts';
    const threeHop = 'src/features/d.ts'; // beyond BFS_DEPTH — must NOT be included

    // Import chain: a <- b <- c <- d (b imports a, c imports b, d imports c).
    await repo.replaceEdges(repoId, [
      { fromFile: oneHop, toFile: changed },
      { fromFile: twoHop, toFile: oneHop },
      { fromFile: threeHop, toFile: twoHop },
    ]);

    await repo.replaceFileFacts(repoId, [
      { filePath: twoHop, endpoints: ['GET /impacted'], crons: [] },
      { filePath: threeHop, endpoints: ['GET /too-far'], crons: [] },
    ]);

    await markIndexed(repoId);

    // `changed` declares no symbols at all — this exercises the case where
    // there are zero direct symbol-callers, so file-level reverse-import
    // impact is the ONLY source of endpoint facts.
    const result = await service.getBlastRadius(repoId, [changed]);

    expect(result.degraded).toBeFalsy();
    expect(result.changedSymbols).toHaveLength(0);
    expect(result.callers).toHaveLength(0);
    expect(result.impactedEndpoints).toContain('GET /impacted');
    expect(result.impactedEndpoints).not.toContain('GET /too-far');
    expect(result.factsByFile?.[twoHop]?.endpoints).toEqual(['GET /impacted']);
    expect(result.factsByFile?.[threeHop]).toBeUndefined();
  });
});
