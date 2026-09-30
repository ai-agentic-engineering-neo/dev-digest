import { describe, expect, it } from 'vitest';
import { captureHandler, stubClient } from '../test-utils.js';
import { registerGetBlastRadiusTool } from './get-blast-radius.js';
import type { BlastRadius } from '../types.js';

const REPO = { id: 'r1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' };
const PR = { id: 'p1', number: 482, title: 'x' };

const BLAST: BlastRadius = {
  changed_symbols: [{ name: 'rateLimit', file: 'src/api/public.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'handler', file: 'src/api/index.ts', line: 23 }],
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: [],
    },
  ],
  summary: '1 changed symbol reaches 1 caller across 1 file, touching 1 endpoint.',
};

function clientWithBlast(blast: BlastRadius) {
  return stubClient({
    get: async (path: string) => {
      if (path === '/repos') return [REPO];
      if (path === `/repos/${REPO.id}/pulls`) return [PR];
      if (path === `/pulls/${PR.id}/blast`) return blast;
      throw new Error(`unexpected GET ${path}`);
    },
  });
}

describe('get_blast_radius', () => {
  it('returns the blast radius as structuredContent', async () => {
    const handler = captureHandler(registerGetBlastRadiusTool, clientWithBlast(BLAST));
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(BLAST);
    expect(result.content[0]!.text).toContain('rateLimit');
  });

  it('surfaces a degraded/partial-index summary as-is, never masking it as empty', async () => {
    const degraded: BlastRadius = {
      changed_symbols: [],
      downstream: [],
      summary: 'Partial index — results may be incomplete. No changed symbols could be resolved yet.',
    };
    const handler = captureHandler(registerGetBlastRadiusTool, clientWithBlast(degraded));
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBeUndefined();
    expect((result.structuredContent as BlastRadius).summary).toMatch(/partial index/i);
  });

  it('returns isError:true when the repo is not configured', async () => {
    const handler = captureHandler(
      registerGetBlastRadiusTool,
      stubClient({ get: async (path: string) => (path === '/repos' ? [] : []) }),
    );
    const result = await handler({ repo: 'acme/does-not-exist', pr: 1 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('acme/does-not-exist');
  });

  it('returns isError:true when the API is unreachable', async () => {
    const handler = captureHandler(
      registerGetBlastRadiusTool,
      stubClient({
        get: async () => {
          throw new Error('fetch failed');
        },
      }),
    );
    const result = await handler({ repo: 'acme/payments-api', pr: 482 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('unreachable');
  });
});
