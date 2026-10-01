import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlastRadiusResponse, PrMeta, Repo } from '@devdigest/shared';
import { ApiError } from '../../src/domain/ports.js';
import { PR_ID, closeClients, connectClient, fakePort, prFixture, repoFixture, textOf } from '../helpers/fixtures.js';

afterEach(closeClients);

const blast: BlastRadiusResponse = {
  changed_symbols: [{ name: 'doThing', file: 'src/a.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'doThing',
      callers: [{ name: 'handler', file: 'src/b.ts', line: 12 }],
      endpoints_affected: ['GET /things'],
      crons_affected: [],
    },
  ],
  summary: '1 symbol changed',
  degraded: false,
  reason: null,
  impacted_endpoints: ['GET /things'],
};

const base = {
  listRepos: async () => [repoFixture()] as unknown as Repo[],
  listPulls: async () => [prFixture()] as unknown as PrMeta[],
};

describe('get_blast_radius tool', () => {
  it('registers with the new description and returns the server payload', async () => {
    const getBlast = vi.fn(async () => blast);
    const client = await connectClient(fakePort({ ...base, getBlast }));
    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_blast_radius')!;
    expect(tool.description).not.toContain('Not yet implemented');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 42 } });
    expect(res.isError).toBeFalsy();
    expect(getBlast).toHaveBeenCalledWith(PR_ID);
    expect(JSON.parse(textOf(res))).toEqual({
      repo: 'acme/api',
      pr: 42,
      summary: blast.summary,
      degraded: false,
      reason: null,
      changed_symbol_count: 1,
      downstream: blast.downstream,
      impacted_endpoints: ['GET /things'],
      omitted: { symbols_without_impact: 0, groups: 0, callers: 0, endpoints: 0 },
    });
  });

  it('says when to call it', async () => {
    const client = await connectClient(fakePort({ ...base, getBlast: async () => blast }));
    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_blast_radius')!;
    expect(tool.description).toMatch(/Call it when reviewing/);
  });

  it('trims a large payload and reports what was omitted', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      symbol: `s${i}`,
      callers: Array.from({ length: 12 }, (_, j) => ({ name: `c${j}`, file: `src/f${j}.ts`, line: j + 1 })),
      endpoints_affected: [],
      crons_affected: [],
    }));
    const big: BlastRadiusResponse = {
      ...blast,
      changed_symbols: many.map((d) => ({ name: d.symbol, file: 'src/a.ts', kind: 'function' })),
      downstream: [...many, { symbol: 'idle', callers: [], endpoints_affected: [], crons_affected: [] }],
      impacted_endpoints: Array.from({ length: 35 }, (_, i) => `GET /e${i}`),
    };
    const client = await connectClient(fakePort({ ...base, getBlast: async () => big }));
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 42 } });
    const out = JSON.parse(textOf(res));
    expect(out.downstream).toHaveLength(12);
    expect(out.downstream[0].callers).toHaveLength(10);
    expect(out.impacted_endpoints).toHaveLength(30);
    expect(out.changed_symbol_count).toBe(15);
    expect(out.omitted).toEqual({ symbols_without_impact: 1, groups: 3, callers: 3 * 12 + 12 * 2, endpoints: 5 });
  });

  it('surfaces resolver errors without calling the API', async () => {
    const getBlast = vi.fn(async () => blast);
    const client = await connectClient(fakePort({ ...base, getBlast }));
    const noPr = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 7 } });
    expect(noPr.isError).toBe(true);
    expect(textOf(noPr)).toContain('PR #7 was not found in repo "acme/api"');
    const noRepo = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'x/y', pr: 42 } });
    expect(textOf(noRepo)).toContain('No repo matching "x/y"');
    const badPr = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 0 } });
    expect(badPr.isError).toBe(true);
    expect(getBlast).not.toHaveBeenCalled();
  });

  it('maps an ApiError 404 to a tool error', async () => {
    const getBlast = async (): Promise<BlastRadiusResponse> => {
      throw new ApiError({ kind: 'not_found', endpoint: `/pulls/${PR_ID}/blast`, status: 404 });
    };
    const client = await connectClient(fakePort({ ...base, getBlast }));
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 42 } });
    expect(res.isError).toBe(true);
    expect(textOf(res).length).toBeGreaterThan(0);
  });
});
