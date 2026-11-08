import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';

/**
 * Persistent-index blast: per-symbol caller cap, viaFile disambiguation,
 * self-caller filtering and kept-files-only facts. No Postgres: the service's
 * repository is replaced with fakes.
 */

interface FakeSym { path: string; name: string; kind: string; line: number | null }

function buildService(opts: {
  symbols: FakeSym[];
  callers: ResolvedCallerRow[];
  facts?: Array<{ filePath: string; endpoints: string[]; crons: string[] }>;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => ({ status: 'full', lastIndexedSha: 'abc' }),
    getSymbolRows: async (_r: string, paths: string[]) =>
      opts.symbols.filter((s) => paths.includes(s.path)),
    getResolvedCallers: async () => opts.callers,
    getFileFacts: async (_r: string, files: string[]) =>
      (opts.facts ?? []).filter((f) => files.includes(f.filePath)),
  };
  return svc;
}

const sym = (path: string, name: string): FakeSym => ({ path, name, kind: 'function', line: 1 });

describe('RepoIntel facade — getBlastRadius caller cap', () => {
  it('caps per (viaFile, viaSymbol), not globally', async () => {
    expect(MAX_CALLERS_PER_SYMBOL).toBe(20);
    const callers: ResolvedCallerRow[] = [];
    for (let i = 1; i <= 25; i += 1) {
      callers.push({ fromPath: `c${i}.ts`, toSymbol: 'alpha', declFile: 'a.ts', line: 5, rank: i });
    }
    for (let i = 1; i <= 3; i += 1) {
      callers.push({ fromPath: `d${i}.ts`, toSymbol: 'beta', declFile: 'b.ts', line: 5, rank: i / 10 });
    }
    const svc = buildService({
      symbols: [sym('a.ts', 'alpha'), sym('b.ts', 'beta')],
      callers,
    });
    const res = await svc.getBlastRadius('r1', ['a.ts', 'b.ts']);
    const alpha = res.callers.filter((c) => c.viaSymbol === 'alpha');
    const beta = res.callers.filter((c) => c.viaSymbol === 'beta');
    expect(alpha).toHaveLength(20);
    expect(alpha.map((c) => c.rank)).toEqual(Array.from({ length: 20 }, (_, i) => 25 - i));
    expect(beta).toHaveLength(3);
    expect(res.callersOmitted).toBe(5);
  });

  it('keeps same-name symbols from different files apart (viaFile)', async () => {
    const svc = buildService({
      symbols: [sym('a.ts', 'foo'), sym('b.ts', 'foo')],
      callers: [
        { fromPath: 'x.ts', toSymbol: 'foo', declFile: 'a.ts', line: 3, rank: 1 },
        { fromPath: 'x.ts', toSymbol: 'foo', declFile: 'b.ts', line: 3, rank: 1 },
      ],
    });
    const res = await svc.getBlastRadius('r1', ['a.ts', 'b.ts']);
    expect(res.callers.map((c) => c.viaFile).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('drops self-callers (fromPath === declFile) and unresolved rows', async () => {
    const svc = buildService({
      symbols: [sym('a.ts', 'alpha')],
      callers: [
        { fromPath: 'a.ts', toSymbol: 'alpha', declFile: 'a.ts', line: 9, rank: 1 },
        { fromPath: 'z.ts', toSymbol: 'alpha', declFile: null, line: 2, rank: 1 },
        { fromPath: 'y.ts', toSymbol: 'alpha', declFile: 'a.ts', line: 2, rank: 1 },
      ],
    });
    const res = await svc.getBlastRadius('r1', ['a.ts']);
    expect(res.callers.map((c) => c.file)).toEqual(['y.ts']);
  });

  it('factsByFile and impactedEndpoints only cover kept caller files', async () => {
    const callers: ResolvedCallerRow[] = [];
    for (let i = 1; i <= 21; i += 1) {
      callers.push({ fromPath: `c${i}.ts`, toSymbol: 'alpha', declFile: 'a.ts', line: 5, rank: i });
    }
    const svc = buildService({
      symbols: [sym('a.ts', 'alpha')],
      callers,
      facts: [
        { filePath: 'c21.ts', endpoints: ['GET /kept'], crons: [] },
        { filePath: 'c1.ts', endpoints: ['GET /dropped'], crons: ['nightly'] },
      ],
    });
    const res = await svc.getBlastRadius('r1', ['a.ts']);
    expect(res.callersOmitted).toBe(1);
    const keptFiles = new Set(res.callers.map((c) => c.file));
    for (const f of Object.keys(res.factsByFile ?? {})) expect(keptFiles.has(f)).toBe(true);
    expect(res.impactedEndpoints).toEqual(['GET /kept']);
  });
});

describe('RepoIntel facade — getBlastRadius ripgrep fallback cap', () => {
  it('caps per (viaFile, viaSymbol), not globally, when the index is off', async () => {
    // Flag off → persistent path is skipped; symbols/references come from codeIndex.
    const symbols = [
      { path: 'a.ts', name: 'alpha', kind: 'function', line: 1 },
      { path: 'b.ts', name: 'beta', kind: 'function', line: 1 },
    ];
    const refs: Record<string, Array<{ fromPath: string; line: number }>> = {
      // 25 distinct caller files for alpha, sorting before beta's (`c…` < `d…`).
      alpha: Array.from({ length: 25 }, (_, i) => ({ fromPath: `c${String(i).padStart(2, '0')}.ts`, line: 3 })),
      beta: Array.from({ length: 3 }, (_, i) => ({ fromPath: `d${i}.ts`, line: 3 })),
    };
    const container = {
      config: { repoIntelEnabled: false },
      db: {} as never,
      codeIndex: {
        symbols: async () => symbols,
        references: async (_ref: unknown, name: string) => refs[name] ?? [],
      },
    } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      // clonePath that doesn't exist → readClone returns null → no endpoints.
      getRepoBasics: async () => ({ owner: 'o', name: 'n', clonePath: '/nonexistent-clone' }),
    };

    const res = await svc.getBlastRadius('r1', ['a.ts', 'b.ts']);
    const alpha = res.callers.filter((c) => c.viaSymbol === 'alpha');
    const beta = res.callers.filter((c) => c.viaSymbol === 'beta');
    expect(alpha).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(alpha.every((c) => c.viaFile === 'a.ts')).toBe(true);
    expect(beta).toHaveLength(3);
    expect(res.callersOmitted).toBe(5);
    expect(res.degraded).toBe(true);
  });
});
