import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { hunkRangesByFile } from '../src/modules/reviews/run-executor.js';
import type { RepoIntelDeps } from '../src/modules/repo-intel/deps.js';

/**
 * AC-38: the callers digest intersects OLD-side (base-coordinate) hunk ranges
 * with the persisted symbol spans, then walks incoming `symbol_edges`.
 */

const SYMBOLS = [
  { path: 'src/lib.ts', name: 'early', kind: 'function', line: 1, endLine: 10, exported: true, signature: 'early()' },
  { path: 'src/lib.ts', name: 'late', kind: 'function', line: 30, endLine: 40, exported: true, signature: 'late()' },
  { path: 'src/use.ts', name: 'callsEarly', kind: 'function', line: 1, endLine: 5, exported: true, signature: 'callsEarly()' },
  { path: 'src/use.ts', name: 'callsLate', kind: 'function', line: 6, endLine: 9, exported: true, signature: 'callsLate()' },
];

function build() {
  const asked: string[] = [];
  const repo = {
    getRepoBasics: async () => ({ owner: 'o', name: 'n', clonePath: '/tmp/x' }),
    tryGetIndexState: async () => ({ status: 'full' }),
    getSymbolRows: async (_id: string, paths: string[]) => SYMBOLS.filter((s) => paths.includes(s.path)),
    getIncomingEdges: async (_id: string, targets: Array<{ path: string; name: string }>) => {
      asked.push(...targets.map((t) => t.name));
      return targets.map((t) => ({
        fromPath: 'src/use.ts',
        fromName: t.name === 'early' ? 'callsEarly' : 'callsLate',
        toPath: t.path,
        toName: t.name,
        kind: 'call',
        confidence: 'exact',
        line: 2,
      }));
    },
    getFileRankFor: async () => [],
  };
  const svc = new RepoIntelService(repo as never, { repoIntelEnabled: true } as unknown as RepoIntelDeps);
  return { svc, asked };
}

const hunk = (oldStart: number, oldLines: number, newStart: number, newLines: number) => ({
  file: 'src/lib.ts',
  oldStart,
  oldLines,
  newStart,
  newLines,
  newLineNumbers: [],
});

describe('callers digest — old-side ranges', () => {
  it('a head-shifted hunk (+5 lines above) still hits the right BASE symbol', async () => {
    const { svc, asked } = build();
    // Base lines 32-34 edited; in head they sit at 37-39 (5 lines were added higher up).
    const ranges = hunkRangesByFile({ raw: '', files: [{ path: 'src/lib.ts', additions: 3, deletions: 3, hunks: [hunk(32, 3, 37, 3)] }] });
    const rows = await svc.getCallerSignatures('r', ['src/lib.ts'], 10, ranges);
    expect(asked).toEqual(['late']);
    expect(rows.map((r) => r.symbol)).toEqual(['callsLate']);
  });

  it('an addition-only hunk inside a function body marks that function changed', async () => {
    const { svc, asked } = build();
    const ranges = hunkRangesByFile({ raw: '', files: [{ path: 'src/lib.ts', additions: 2, deletions: 0, hunks: [hunk(5, 0, 6, 2)] }] });
    expect(ranges.get('src/lib.ts')).toEqual([{ start: 5, end: 5 }]);
    const rows = await svc.getCallerSignatures('r', ['src/lib.ts'], 10, ranges);
    expect(asked).toEqual(['early']);
    expect(rows.map((r) => r.symbol)).toEqual(['callsEarly']);
  });

  it('no ranges for the file ⇒ every callable symbol counts (legacy)', async () => {
    const { svc, asked } = build();
    await svc.getCallerSignatures('r', ['src/lib.ts'], 10);
    expect(asked.sort()).toEqual(['early', 'late']);
  });
});
