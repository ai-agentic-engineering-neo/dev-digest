import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { toBlastRadiusResponse, buildSummary } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const sym = (name: string) => ({ file: `src/${name}.ts`, name, kind: 'function' });
const caller = (file: string, symbol: string, viaSymbol: string, line = 1) => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank: 0,
});

describe('toBlastRadiusResponse', () => {
  const result: BlastResult = {
    changedSymbols: [sym('a'), sym('b')],
    callers: [
      caller('x.ts', 'fx', 'b', 3),
      caller('y.ts', 'fy', 'a', 7),
      caller('z.ts', 'fz', 'a', 9),
      caller('w.ts', 'fw', 'orphan', 2),
    ],
    impactedEndpoints: ['GET /y', 'POST /x'],
    factsByFile: {
      'x.ts': { endpoints: ['POST /x'], crons: ['nightly'] },
      'y.ts': { endpoints: ['GET /y'], crons: [] },
      'z.ts': { endpoints: ['GET /y', 'GET /z'], crons: ['hourly'] },
    },
  };

  it('groups callers by viaSymbol in changedSymbols order, then leftovers', () => {
    const r = toBlastRadiusResponse(result);
    expect(r.downstream.map((d) => d.symbol)).toEqual(['a', 'b', 'orphan']);
    expect(r.downstream[0]!.callers).toEqual([
      { name: 'fy', file: 'y.ts', line: 7 },
      { name: 'fz', file: 'z.ts', line: 9 },
    ]);
    expect(r.changed_symbols[0]).toEqual({ name: 'a', file: 'src/a.ts', kind: 'function' });
  });

  it('attributes sorted, deduped facts per group', () => {
    const r = toBlastRadiusResponse(result);
    expect(r.downstream[0]!.endpoints_affected).toEqual(['GET /y', 'GET /z']);
    expect(r.downstream[0]!.crons_affected).toEqual(['hourly']);
    expect(r.downstream[1]!.endpoints_affected).toEqual(['POST /x']);
    expect(r.downstream[1]!.crons_affected).toEqual(['nightly']);
    expect(r.downstream[2]!.endpoints_affected).toEqual([]);
    expect(r.impacted_endpoints).toEqual(['GET /y', 'POST /x']);
  });

  it('falls back to empty facts when factsByFile is absent', () => {
    const { factsByFile: _f, ...rest } = result;
    const r = toBlastRadiusResponse(rest);
    expect(r.downstream.every((d) => d.endpoints_affected.length === 0 && d.crons_affected.length === 0)).toBe(true);
  });

  it('handles zero callers and passes degraded through', () => {
    const r = toBlastRadiusResponse({
      changedSymbols: [sym('a')],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'index_failed',
    });
    expect(r.downstream).toEqual([{ symbol: 'a', callers: [], endpoints_affected: [], crons_affected: [] }]);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_failed');
    expect(r.summary).toBe('1 changed symbol, no downstream callers found.');
    expect(() => BlastRadiusResponse.parse(r)).not.toThrow();
  });

  it('counts same-named symbols in different files once and keeps endpoints when no callers', () => {
    const r = toBlastRadiusResponse({
      changedSymbols: [
        { file: 'src/a.ts', name: 'init', kind: 'function' },
        { file: 'src/b.ts', name: 'init', kind: 'function' },
      ],
      callers: [],
      impactedEndpoints: ['GET /x'],
    });
    expect(r.downstream).toHaveLength(1);
    expect(r.summary).toBe('1 changed symbol, no downstream callers found, 1 endpoint still affected.');
    expect(r.summary.startsWith(`${r.downstream.length} changed symbol`)).toBe(true);
  });

  it('defaults degraded=false/reason=null and builds a deterministic summary', () => {
    const r = toBlastRadiusResponse(result);
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.summary).toBe('3 changed symbols, 4 downstream callers, 2 endpoints and 2 crons affected.');
    expect(buildSummary(1, 1, 1, 1)).toBe(
      '1 changed symbol, 1 downstream caller, 1 endpoint and 1 cron affected.',
    );
  });
});
