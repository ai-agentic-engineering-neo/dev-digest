import { describe, it, expect } from 'vitest';
import { toBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

/**
 * `toBlastRadius` — pure mapping from `repoIntel`'s internal `BlastResult`
 * (flat callers + file-keyed facts) to the public `BlastRadius` wire
 * contract (one `DownstreamImpact` per changed symbol). No DB, no LLM.
 */
describe('blast/helpers — toBlastRadius', () => {
  it('groups callers by viaSymbol into one DownstreamImpact per changed symbol', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/api/public.ts', name: 'rateLimit', kind: 'function' },
        { file: 'src/api/public.ts', name: 'bucketKey', kind: 'function' },
      ],
      callers: [
        { file: 'src/api/index.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 23, rank: 10 },
        { file: 'src/api/webhooks.ts', symbol: 'onWebhook', viaSymbol: 'rateLimit', line: 45, rank: 5 },
      ],
      impactedEndpoints: ['GET /api/public/items'],
      factsByFile: {
        'src/api/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
      },
      degraded: false,
    };

    const parsed = toBlastRadius(result);

    expect(parsed.changed_symbols).toEqual([
      { name: 'rateLimit', file: 'src/api/public.ts', kind: 'function' },
      { name: 'bucketKey', file: 'src/api/public.ts', kind: 'function' },
    ]);
    // One downstream entry per changed symbol, in the same order.
    expect(parsed.downstream).toHaveLength(2);
    expect(parsed.downstream[0]!.symbol).toBe('rateLimit');
    expect(parsed.downstream[0]!.callers).toEqual([
      { name: 'handler', file: 'src/api/index.ts', line: 23 },
      { name: 'onWebhook', file: 'src/api/webhooks.ts', line: 45 },
    ]);
    expect(parsed.downstream[0]!.endpoints_affected).toEqual(['GET /api/public/items']);
    // bucketKey has no callers — present, empty, never dropped.
    expect(parsed.downstream[1]!.symbol).toBe('bucketKey');
    expect(parsed.downstream[1]!.callers).toEqual([]);
    expect(parsed.downstream[1]!.endpoints_affected).toEqual([]);
  });

  it('does NOT attribute a file reached only via the reverse-import BFS to a symbol with no real caller there — that would tag every symbol in a busy file with the same unrelated route', () => {
    // `webhooks.ts` never calls `rateLimit` directly — it's only reachable by
    // walking imports from `public.ts` (`dependentFilesByChangedFile`). A
    // composition-root file (e.g. a DI container) sits ~2 import-hops from
    // almost everything, so folding this into every symbol's
    // endpoints_affected would make every symbol in a file look like it
    // touches the same handful of unrelated routes. Per-symbol attribution
    // stays precise: only a symbol's OWN resolved callers count.
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/api/public.ts', name: 'rateLimit', kind: 'function' }],
      callers: [],
      impactedEndpoints: ['POST /api/public/webhooks'],
      factsByFile: {
        'src/api/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: ['job:cleanup'] },
      },
      dependentFilesByChangedFile: { 'src/api/public.ts': ['src/api/webhooks.ts'] },
      degraded: false,
    };

    const parsed = toBlastRadius(result);
    expect(parsed.downstream[0]!.endpoints_affected).toEqual([]);
    expect(parsed.downstream[0]!.crons_affected).toEqual([]);
    // The reverse-import reach isn't discarded — it still shows up PR-wide.
    expect(parsed.summary).toContain('1 endpoint');
  });

  it('attributes endpoints/crons only from a symbol\'s own resolved caller files', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/api/public.ts', name: 'rateLimit', kind: 'function' }],
      callers: [{ file: 'src/api/index.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 23, rank: 10 }],
      impactedEndpoints: ['GET /api/public/items'],
      factsByFile: {
        'src/api/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
      },
      degraded: false,
    };

    const parsed = toBlastRadius(result);
    expect(parsed.downstream[0]!.endpoints_affected).toEqual(['GET /api/public/items']);
  });

  it('summary calls out a degraded/partial index instead of masking it as empty', () => {
    const degraded: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    expect(toBlastRadius(degraded).summary).toMatch(/partial index/i);

    const full: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/b.ts', symbol: 'caller', viaSymbol: 'foo', line: 1, rank: 1 }],
      impactedEndpoints: [],
      degraded: false,
    };
    const summary = toBlastRadius(full).summary;
    expect(summary).not.toMatch(/partial index/i);
    expect(summary).toContain('1 changed symbol');
    expect(summary).toContain('1 caller');
  });
});
