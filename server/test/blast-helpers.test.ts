/** blast: mapping from the facade's flat BlastResult to the grouped BlastRadius contract. */
import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { firstLine, summarize, toBlastRadius, toHistory } from '../src/modules/blast/helpers.js';
import type { IntelBlastResult } from '../src/modules/blast/ports.js';

const PERSISTENT: IntelBlastResult = {
  changedSymbols: [
    { file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/middleware/ratelimit.ts', name: 'bucketKey', kind: 'function' },
    { file: 'src/middleware/ratelimit.ts', name: 'Options', kind: 'interface' },
  ],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 9 },
    { file: 'src/api/public/webhooks.ts', symbol: 'webhookHandler', viaSymbol: 'rateLimit', line: 45, rank: 7 },
    { file: 'src/server.ts', symbol: 'app', viaSymbol: 'rateLimit', line: 88, rank: 3 },
    { file: 'src/middleware/ratelimit.ts', symbol: 'rateLimit', viaSymbol: 'bucketKey', line: 12, rank: 3 },
    { file: 'src/jobs/reset.ts', symbol: 'resetBuckets', viaSymbol: 'bucketKey', line: 5, rank: 1 },
  ],
  impactedEndpoints: ['GET /api/public/items', 'POST /api/public/webhooks'],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items', 'GET /api/public/health'], crons: [] },
    'src/api/public/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: [] },
    'src/jobs/reset.ts': { endpoints: [], crons: ['reset-rate-buckets (hourly)'] },
  },
  degraded: false,
};

describe('toBlastRadius', () => {
  it('groups callers under their changed symbol, attributes endpoints and crons through the caller files', () => {
    const radius = BlastRadius.parse(toBlastRadius(PERSISTENT));
    expect(radius.changed_symbols).toHaveLength(3);
    // Symbols without callers are not downstream entries; most callers first.
    expect(radius.downstream.map((d) => d.symbol)).toEqual(['rateLimit', 'bucketKey']);
    const rl = radius.downstream[0]!;
    expect(rl.callers.map((c) => `${c.name}@${c.file}:${c.line}`)).toEqual([
      'publicRouter@src/api/public/index.ts:23',
      'webhookHandler@src/api/public/webhooks.ts:45',
      'app@src/server.ts:88',
    ]);
    expect(rl.callers[0]!.endpoints).toEqual(['GET /api/public/items', 'GET /api/public/health']);
    expect(rl.callers[2]!.endpoints).toEqual([]); // file without facts → empty, not undefined
    expect(rl.endpoints_affected).toEqual(['GET /api/public/health', 'GET /api/public/items', 'POST /api/public/webhooks']);
    expect(rl.crons_affected).toEqual([]);
    const bk = radius.downstream[1]!;
    expect(bk.endpoints_affected).toEqual([]);
    expect(bk.crons_affected).toEqual(['reset-rate-buckets (hourly)']);
    expect(radius.summary).toBe(
      '3 changed symbols reach 5 callers in 5 files, 3 endpoints and 1 cron job.',
    );
  });

  it('on the ripgrep fallback (no facts) the flat endpoint union goes to every symbol with callers', () => {
    const { factsByFile: _facts, ...flat } = PERSISTENT;
    const radius = toBlastRadius({ ...flat, degraded: true, reason: 'no_data' });
    for (const d of radius.downstream) {
      expect(d.endpoints_affected).toEqual(['GET /api/public/items', 'POST /api/public/webhooks']);
      expect(d.crons_affected).toEqual([]);
      for (const c of d.callers) {
        expect(c.endpoints).toBeUndefined();
        expect(c.crons).toBeUndefined();
      }
    }
  });

  it('empty results give an honest summary', () => {
    expect(toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] }).summary).toMatch(/No symbols/);
    expect(summarize(2, [])).toBe('2 changed symbols, no downstream callers found.');
    expect(summarize(1, [])).toBe('1 changed symbol, no downstream callers found.');
  });
});

describe('history', () => {
  it('maps prior PRs and takes the first prose line of the body as notes', () => {
    const [item] = toHistory([
      {
        number: 401,
        title: 'Introduce public API namespace',
        author: 'deepak.r',
        openedAt: new Date('2026-03-10T00:00:00Z'),
        updatedAt: new Date('2026-03-18T00:00:00Z'),
        body: '## Summary\n\nOriginal /api/public/* split-out.\nMore text.',
        filesOverlap: ['src/api/public/index.ts'],
      },
    ]);
    expect(item).toEqual({
      pr_number: 401,
      title: 'Introduce public API namespace',
      merged_at: '2026-03-18T00:00:00.000Z',
      author: 'deepak.r',
      files_overlap: ['src/api/public/index.ts'],
      notes: 'Original /api/public/* split-out.',
    });
  });

  it('firstLine skips headings and comments, clips long lines, and is empty without a body', () => {
    expect(firstLine(null)).toBe('');
    expect(firstLine('<!-- template -->\n# Title\n')).toBe('');
    expect(firstLine('x'.repeat(300))).toHaveLength(200);
    expect(firstLine('x'.repeat(300)).endsWith('…')).toBe(true);
  });
});
