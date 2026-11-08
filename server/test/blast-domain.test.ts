import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildBlastRadius, blastSummary, EMPTY_BLAST_RESULT } from '../src/modules/blast/domain/build.js';
import { deriveBlastStatus } from '../src/modules/blast/domain/status.js';
import type {
  BlastIndexSnapshot,
  BlastIntelResult,
  BlastStatus,
} from '../src/modules/blast/domain/types.js';

const OK: BlastStatus = { degraded: false, reason: null };
const FULL: BlastIndexSnapshot = { status: 'full', lastIndexedSha: 'idx111' };

function keyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? [keyShape(value[0])] : [];
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = keyShape((value as Record<string, unknown>)[k]);
    return out;
  }
  return value === null ? 'null' : typeof value;
}

const caller = (file: string, symbol: string, viaFile: string, viaSymbol: string, line: number, rank = 1) => ({
  file, symbol, viaFile, viaSymbol, line, rank,
});

const build = (result: BlastIntelResult, status: BlastStatus = OK, index = FULL, headSha = 'head999') =>
  buildBlastRadius({ prId: 'pr-1', headSha, index, result, status });

describe('deriveBlastStatus', () => {
  const okResult = {};
  const cases: Array<[string, Parameters<typeof deriveBlastStatus>[0], BlastStatus]> = [
    ['flag_off', { repoIntelEnabled: false, index: FULL, result: okResult }, { degraded: true, reason: 'flag_off' }],
    [
      'no_data (synthesized row)',
      { repoIntelEnabled: true, index: { status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data' }, result: okResult },
      { degraded: true, reason: 'no_data' },
    ],
    [
      'index_failed default',
      { repoIntelEnabled: true, index: { status: 'failed', lastIndexedSha: 'x' }, result: okResult },
      { degraded: true, reason: 'index_failed' },
    ],
    [
      'repo_too_large',
      { repoIntelEnabled: true, index: { status: 'degraded', lastIndexedSha: 'x', degradedReason: 'repo_too_large' }, result: okResult },
      { degraded: true, reason: 'repo_too_large' },
    ],
    [
      'index_partial',
      { repoIntelEnabled: true, index: { status: 'partial', lastIndexedSha: 'x' }, result: okResult },
      { degraded: true, reason: 'index_partial' },
    ],
    [
      'full + degraded result',
      { repoIntelEnabled: true, index: FULL, result: { degraded: true, reason: 'no_data' } },
      { degraded: true, reason: 'no_data' },
    ],
    ['full + ok', { repoIntelEnabled: true, index: FULL, result: okResult }, OK],
  ];
  it.each(cases)('%s', (_n, input, expected) => {
    const s = deriveBlastStatus(input);
    expect(s).toEqual(expected);
    expect(s.degraded).toBe(s.reason !== null);
  });
});

describe('blastSummary', () => {
  it('singular', () => {
    expect(blastSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 }, OK)).toBe(
      '1 changed symbol · 1 caller · 1 endpoint · 1 cron',
    );
  });
  it('plural and zero', () => {
    expect(blastSummary({ symbols: 2, callers: 3, endpoints: 2, crons: 0 }, OK)).toBe(
      '2 changed symbols · 3 callers · 2 endpoints · 0 crons',
    );
  });
  it('degraded suffix', () => {
    expect(blastSummary({ symbols: 0, callers: 0, endpoints: 0, crons: 0 }, { degraded: true, reason: 'flag_off' })).toBe(
      '0 changed symbols · 0 callers · 0 endpoints · 0 crons (degraded: flag_off)',
    );
  });
});

describe('buildBlastRadius', () => {
  it('empty result', () => {
    const r = build(EMPTY_BLAST_RESULT);
    expect(r.downstream).toEqual([]);
    expect(r.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('keeps symbols without callers out of downstream but in counts', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [
        { name: 'a', file: 'x.ts', kind: 'function' },
        { name: 'b', file: 'x.ts', kind: 'function' },
      ],
      callers: [caller('c.ts', 'run', 'x.ts', 'a', 3)],
    });
    expect(r.counts.symbols).toBe(2);
    expect(r.downstream.map((d) => d.symbol)).toEqual(['a']);
  });

  it('dedupes callers and symbols', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [
        { name: 'a', file: 'x.ts', kind: 'function' },
        { name: 'a', file: 'x.ts', kind: 'function' },
      ],
      callers: [caller('c.ts', 'run', 'x.ts', 'a', 3), caller('c.ts', 'run', 'x.ts', 'a', 3)],
    });
    expect(r.changed_symbols).toHaveLength(1);
    expect(r.downstream[0]?.callers).toHaveLength(1);
    expect(r.counts.callers).toBe(1);
  });

  it('same name in two files yields two downstream entries', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [
        { name: 'foo', file: 'a.ts', kind: 'function' },
        { name: 'foo', file: 'b.ts', kind: 'class' },
      ],
      callers: [caller('c.ts', 'x', 'a.ts', 'foo', 1), caller('d.ts', 'y', 'b.ts', 'foo', 2)],
    });
    expect(r.downstream).toHaveLength(2);
    expect(r.downstream.map((d) => [d.file, d.kind])).toEqual([
      ['a.ts', 'function'],
      ['b.ts', 'class'],
    ]);
  });

  it('attributes endpoints and crons per symbol via factsByFile', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [{ name: 'a', file: 'x.ts', kind: 'function' }],
      callers: [caller('r.ts', 'h', 'x.ts', 'a', 1), caller('j.ts', 'job', 'x.ts', 'a', 2)],
      impactedEndpoints: ['GET /ignored'],
      factsByFile: {
        'r.ts': { endpoints: ['POST /u', 'GET /u'], crons: [] },
        'j.ts': { endpoints: ['POST /u'], crons: ['nightly'] },
      },
    });
    expect(r.downstream[0]?.endpoints_affected).toEqual(['GET /u', 'POST /u']);
    expect(r.downstream[0]?.crons_affected).toEqual(['nightly']);
    expect(r.unattributed_endpoints).toEqual([]);
    expect(r.counts.endpoints).toBe(2);
    expect(r.counts.crons).toBe(1);
  });

  it('fallback without factsByFile fills unattributed_endpoints', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [{ name: 'a', file: 'x.ts', kind: 'function' }],
      callers: [caller('r.ts', 'h', 'x.ts', 'a', 1)],
      impactedEndpoints: ['POST /b', 'GET /a', 'GET /a'],
    });
    expect(r.unattributed_endpoints).toEqual(['GET /a', 'POST /b']);
    expect(r.downstream[0]?.endpoints_affected).toEqual([]);
    expect(r.counts.endpoints).toBe(2);
  });

  it('carries callers_omitted', () => {
    expect(build({ ...EMPTY_BLAST_RESULT, callersOmitted: 7 }).callers_omitted).toBe(7);
  });

  it('sorts symbols and downstream deterministically', () => {
    const r = build({
      ...EMPTY_BLAST_RESULT,
      changedSymbols: [
        { name: 'z', file: 'b.ts', kind: 'function' },
        { name: 'a', file: 'b.ts', kind: 'function' },
        { name: 'm', file: 'a.ts', kind: 'function' },
      ],
      callers: [
        caller('c.ts', 'x', 'a.ts', 'm', 1),
        caller('c.ts', 'x', 'b.ts', 'a', 2),
        caller('d.ts', 'y', 'b.ts', 'a', 3),
        caller('c.ts', 'x', 'b.ts', 'z', 4),
      ],
    });
    expect(r.changed_symbols.map((s) => `${s.file}:${s.name}`)).toEqual(['a.ts:m', 'b.ts:a', 'b.ts:z']);
    expect(r.downstream.map((d) => `${d.file}:${d.symbol}`)).toEqual(['b.ts:a', 'a.ts:m', 'b.ts:z']);
  });

  it('unknown kind when the symbol is not in changed_symbols', () => {
    const r = build({ ...EMPTY_BLAST_RESULT, callers: [caller('c.ts', 'x', 'q.ts', 'q', 1)] });
    expect(r.downstream[0]?.kind).toBe('unknown');
  });

  it('D5: link_sha is indexed_sha when present', () => {
    const r = build(EMPTY_BLAST_RESULT, OK, { status: 'full', lastIndexedSha: 'idx111' }, 'head999');
    expect(r.indexed_sha).toBe('idx111');
    expect(r.link_sha).toBe('idx111');
  });

  it('D5: link_sha falls back to head_sha when never indexed', () => {
    const r = build(EMPTY_BLAST_RESULT, OK, { status: 'full', lastIndexedSha: '' }, 'head999');
    expect(r.indexed_sha).toBeNull();
    expect(r.link_sha).toBe('head999');
  });

  it('degraded status is mirrored with invariant', () => {
    const r = build(EMPTY_BLAST_RESULT, { degraded: true, reason: 'index_partial' });
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
    expect(r.summary).toContain('(degraded: index_partial)');
  });

  it('D6: output key shape matches the golden fixture', () => {
    const fixture: unknown = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/blast-radius-response.json'), 'utf8'),
    );
    const r = build({
      changedSymbols: [{ name: 'createUser', file: 'src/users/service.ts', kind: 'function' }],
      callers: [caller('src/users/routes.ts', 'postUsers', 'src/users/service.ts', 'createUser', 42)],
      impactedEndpoints: [],
      factsByFile: { 'src/users/routes.ts': { endpoints: ['POST /users'], crons: ['nightly-cleanup'] } },
      callersOmitted: 0,
    });
    // fixture carries a sample unattributed endpoint; mirror it so array element shapes compare
    const withUnattributed = { ...r, unattributed_endpoints: ['GET /health'] };
    expect(keyShape(withUnattributed)).toEqual(keyShape(fixture));
  });
});
