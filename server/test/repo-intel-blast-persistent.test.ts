import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * `tryPersistentBlast` (private, reached via `getBlastRadius` when
 * `repoIntelEnabled=true` and the index is `full`/`partial`) — two
 * regressions fixed alongside wiring up `blast/`:
 *
 *   1. The caller cap (`MAX_CALLERS_PER_SYMBOL`) must apply PER changed
 *      symbol, not once globally across every symbol's callers combined.
 *   2. Reverse-import BFS results are kept per-changed-file so `blast/`
 *      can attribute endpoint impact back to the right symbol.
 *
 * No Postgres — the service's `repo` (RepoIntelRepository) is stubbed with
 * controlled rows, same pattern as `repo-intel-facade-degraded.test.ts`.
 */

const INDEX_STATE: IndexState = {
  repoId: 'r1',
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 0,
  lastIndexedSha: 'abc123',
  indexerVersion: 1,
  updatedAt: new Date(),
};

function buildPersistentService(opts: {
  declRows: Array<{ path: string; name: string; kind: string; line: number; endLine: number; exported: boolean; signature: string | null }>;
  callerRows: Array<{ fromPath: string; toSymbol: string; line: number; rank: number }>;
  dependentFiles?: string[];
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => INDEX_STATE,
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      opts.declRows.filter((r) => paths.includes(r.path)),
    getResolvedCallers: async () => opts.callerRows,
    getDependentFiles: async () => opts.dependentFiles ?? [],
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — persistent blast, caller cap + BFS bookkeeping', () => {
  it('caps callers PER symbol, not globally, when multiple symbols are changed', async () => {
    const declRows = [
      { path: 'src/a.ts', name: 'foo', kind: 'function', line: 1, endLine: 3, exported: true, signature: null },
      { path: 'src/a.ts', name: 'bar', kind: 'function', line: 5, endLine: 7, exported: true, signature: null },
    ];
    const callerRows = [
      ...Array.from({ length: 25 }, (_, i) => ({
        fromPath: `src/caller-foo-${i}.ts`,
        toSymbol: 'foo',
        line: 1,
        rank: 25 - i,
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        fromPath: `src/caller-bar-${i}.ts`,
        toSymbol: 'bar',
        line: 1,
        rank: 25 - i,
      })),
    ];
    const svc = buildPersistentService({ declRows, callerRows });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);

    expect(blast.degraded).toBe(false);
    const fooCallers = blast.callers.filter((c) => c.viaSymbol === 'foo');
    const barCallers = blast.callers.filter((c) => c.viaSymbol === 'bar');
    // Each symbol keeps its own MAX_CALLERS_PER_SYMBOL callers — a global cap
    // would have starved one of the two symbols entirely.
    expect(fooCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(barCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(blast.callers.length).toBe(MAX_CALLERS_PER_SYMBOL * 2);
  });

  it('keeps reverse-import BFS reach per changed file (dependentFilesByChangedFile)', async () => {
    const declRows = [
      { path: 'src/a.ts', name: 'foo', kind: 'function', line: 1, endLine: 3, exported: true, signature: null },
    ];
    const svc = buildPersistentService({
      declRows,
      callerRows: [],
      dependentFiles: ['src/dependent.ts'],
    });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(blast.dependentFilesByChangedFile?.['src/a.ts']).toContain('src/dependent.ts');
  });

  it('a symbol with zero callers still appears with an empty caller list (never dropped)', async () => {
    const declRows = [
      { path: 'src/a.ts', name: 'unused', kind: 'function', line: 1, endLine: 3, exported: true, signature: null },
    ];
    const svc = buildPersistentService({ declRows, callerRows: [] });

    const blast = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(blast.changedSymbols).toEqual([{ file: 'src/a.ts', name: 'unused', kind: 'function' }]);
    expect(blast.callers).toEqual([]);
  });
});
