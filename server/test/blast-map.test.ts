/**
 * mapFacadeBlast — the facade BlastResult → public BlastRadius mapping that the
 * blast migration relies on. Pure (no DB): pins per-symbol grouping, per-file
 * endpoint/cron attribution, and caller line passthrough.
 */
import { describe, it, expect } from 'vitest';
import { mapFacadeBlast } from '../src/modules/blast/service.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('mapFacadeBlast', () => {
  it('groups callers by changed symbol + attributes endpoints/crons per caller file', () => {
    const fb: BlastResult = {
      changedSymbols: [{ file: 'src/rl.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/users.ts', symbol: 'listUsers', viaSymbol: 'rateLimit', line: 12, rank: 5 },
        { file: 'src/api/orders.ts', symbol: 'createOrder', viaSymbol: 'rateLimit', line: 30, rank: 3 },
      ],
      impactedEndpoints: ['GET /users'],
      factsByFile: {
        'src/api/users.ts': { endpoints: ['GET /users'], crons: [] },
        'src/api/orders.ts': { endpoints: ['POST /orders'], crons: ['nightly-reconcile'] },
      },
      degraded: false,
    };

    const r = mapFacadeBlast(fb);
    expect(r.changed_symbols).toEqual([{ name: 'rateLimit', file: 'src/rl.ts', kind: 'function' }]);
    expect(r.downstream).toHaveLength(1);
    const d = r.downstream[0]!;
    expect(d.symbol).toBe('rateLimit');
    expect(d.callers).toEqual([
      { name: 'listUsers', file: 'src/api/users.ts', line: 12 },
      { name: 'createOrder', file: 'src/api/orders.ts', line: 30 },
    ]);
    expect([...d.endpoints_affected].sort()).toEqual(['GET /users', 'POST /orders']);
    expect(d.crons_affected).toEqual(['nightly-reconcile']);
    expect(typeof r.summary).toBe('string');
  });

  it('produces empty downstream when there are no callers', () => {
    const fb: BlastResult = {
      changedSymbols: [{ file: 'a.ts', name: 'f', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const r = mapFacadeBlast(fb);
    expect(r.downstream).toHaveLength(0);
    expect(r.changed_symbols).toHaveLength(1);
  });
});
