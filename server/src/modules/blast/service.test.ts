import { describe, expect, it } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { BlastService, type PrFileLookup } from './service.js';
import { BlastQuerySchema } from './routes.js';
import type { BlastGraphResult, BlastRequest, RepoIntel } from '../../domain/ports/repo-intel.js';

/** Hermetic unit test — fake `PrFileLookup` + fake `RepoIntel`, no DB, no container. */

const PULL = { id: 'pr1', repoId: 'repo1', number: 7, headSha: 'head1', baseSha: 'base1' };
const FILES = [{ path: 'src/utils/helper.ts', patch: '@@ -1 +1 @@', status: 'modified', previousPath: null }];

function graphResult(over: Partial<BlastGraphResult> = {}): BlastGraphResult {
  return {
    graph: {
      nodes: [],
      edges: [],
      truncation: { truncated: false, nodesDropped: 0, edgesDropped: 0, totalsCapped: false, maxDepth: 6, maxNodes: 300, maxEdges: 600 },
      entryPoints: { items: [], total: 0 },
      tests: { items: [], total: 0 },
    },
    overlay: { staleOverlay: false, overlayDegraded: false, degradedFiles: [], degradedCount: 0, baseSha: 'base1', headSha: 'head1', indexedSha: 'base1' },
    index: { status: 'full', indexedSha: 'base1', lowConfidence: false },
    reindexing: null,
    changed: [],
    projection: { callers: [], impactedEndpoints: [], factsByFile: {} },
    ...over,
  };
}

function buildService(opts: {
  getPull?: PrFileLookup['getPull'];
  result?: BlastGraphResult;
} = {}) {
  const seen: BlastRequest[] = [];
  const prFiles: PrFileLookup = {
    getPull: opts.getPull ?? (async () => PULL),
    getPrFiles: async () => FILES,
  };
  const repoIntel = {
    getBlastGraph: async (_repoId: string, req: BlastRequest) => {
      seen.push(req);
      return opts.result ?? graphResult();
    },
  } as unknown as RepoIntel;
  return { service: new BlastService(prFiles, repoIntel), seen };
}

describe('BlastService.getBlast', () => {
  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.getBlast('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('passes head/base/patch/status and query options to getBlastGraph', async () => {
    const { service, seen } = buildService();
    await service.getBlast('ws1', 'pr1', { depth: 3, includeTypeOnly: false });
    expect(seen[0]).toEqual({
      headSha: 'head1',
      baseSha: 'base1',
      prNumber: 7,
      files: [{ path: 'src/utils/helper.ts', patch: '@@ -1 +1 @@', status: 'modified', previousPath: null }],
      depth: 3,
      includeTypeOnly: false,
    });
  });

  it('defaults includeTypeOnly to true when no query is given', async () => {
    const { service, seen } = buildService();
    await service.getBlast('ws1', 'pr1');
    expect(seen[0]!.includeTypeOnly).toBe(true);
  });

  it('groups callers by viaSymbol, caps at 20, flags type_only, and keeps data BlastRadius-valid (AC-34)', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      file: `src/c${i}.ts`, symbol: `c${i}`, viaSymbol: 'helper', line: i + 1, rank: 1,
    }));
    const result = graphResult({
      changed: [
        { file: 'src/utils/helper.ts', name: 'helper', kind: 'function', deleted: false },
        { file: 'src/utils/helper.ts', name: 'unused', kind: 'function', deleted: false },
      ],
      graph: {
        ...graphResult().graph,
        nodes: [{ id: 'src/c0.ts#c0', kind: 'symbol', name: 'c0', path: 'src/c0.ts', role: 'impacted', depth: 1, typeOnly: true }],
      },
      projection: {
        callers: many,
        impactedEndpoints: ['GET /x'],
        factsByFile: { 'src/c1.ts': { endpoints: ['GET /x'], crons: ['nightly'] } },
      },
    });
    const { service } = buildService({ result });
    const env = await service.getBlast('ws1', 'pr1');

    expect(BlastRadius.safeParse(env.data).success).toBe(true);
    expect(env.data.changed_symbols).toHaveLength(2);
    expect(env.data.downstream).toHaveLength(1);
    const g = env.data.downstream[0]!;
    expect(g.callers).toHaveLength(20);
    expect(g.callers[0]!.type_only).toBe(true);
    expect(g.callers[1]!.type_only).toBeUndefined();
    expect(g.endpoints_affected).toEqual(['GET /x']);
    expect(g.crons_affected).toEqual(['nightly']);
  });

  it('adds index/overlay/graph additively and no reindexing when idle', async () => {
    const { service } = buildService();
    const env = await service.getBlast('ws1', 'pr1');
    expect(env.status).toBe('full');
    expect(env.index.indexedSha).toBe('base1');
    expect(env.overlay.headSha).toBe('head1');
    expect(env.graph.nodes).toEqual([]);
    expect('reindexing' in env).toBe(false);
    expect(env.degradedReason).toBeUndefined();
  });

  it('reindexing ⇒ envelope says so and data is empty-but-valid', async () => {
    const result = graphResult({
      reindexing: { state: 'running', done: 1, total: 5 },
      index: { status: 'full', indexedSha: null, lowConfidence: false, reindexing: { state: 'running', done: 1, total: 5 } },
    });
    const { service } = buildService({ result });
    const env = await service.getBlast('ws1', 'pr1');
    expect(env.reindexing).toEqual({ state: 'running', done: 1, total: 5 });
    expect(env.data).toEqual({ changed_symbols: [], downstream: [] });
    expect(BlastRadius.safeParse(env.data).success).toBe(true);
  });

  it('surfaces the fallback reason as degradedReason and null index status as degraded', async () => {
    const result = graphResult({ fallback: 'index_failed', index: { status: null, indexedSha: null, lowConfidence: true } });
    const { service } = buildService({ result });
    const env = await service.getBlast('ws1', 'pr1');
    expect(env.status).toBe('degraded');
    expect(env.degradedReason).toBe('index_failed');
  });
});

describe('BlastQuerySchema', () => {
  it('defaults include_type_only to true and leaves depth undefined', () => {
    expect(BlastQuerySchema.parse({})).toEqual({ depth: undefined, include_type_only: true });
  });
  it('parses include_type_only=false', () => {
    expect(BlastQuerySchema.parse({ include_type_only: 'false' }).include_type_only).toBe(false);
  });
  it('clamps depth to 1…6', () => {
    expect(BlastQuerySchema.parse({ depth: '0' }).depth).toBe(1);
    expect(BlastQuerySchema.parse({ depth: '99' }).depth).toBe(6);
    expect(BlastQuerySchema.parse({ depth: '3' }).depth).toBe(3);
  });
  it('rejects non-integer depth', () => {
    expect(BlastQuerySchema.safeParse({ depth: 'abc' }).success).toBe(false);
  });
});
