import { afterEach, describe, expect, it } from 'vitest';
import type { PrMeta, Repo } from '@devdigest/shared';
import { closeClients, connectClient, fakePort, prFixture, repoFixture, textOf } from '../helpers/fixtures.js';

afterEach(closeClients);

const api = fakePort({
  listRepos: async () => [repoFixture()] as unknown as Repo[],
  listPulls: async () => [prFixture()] as unknown as PrMeta[],
});

describe('get_blast_radius tool (stub)', () => {
  it('registers verbatim and returns a normal not_implemented result', async () => {
    const client = await connectClient(api);
    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_blast_radius')!;
    expect(tool.description).toBe(
      'Get the blast radius (impact map) of a pull request — which modules/consumers it affects. Not yet implemented.',
    );
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 42 } });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(textOf(res))).toMatchObject({ status: 'not_implemented', repo: 'acme/api', pr: 42 });
  });

  it('still validates repo and PR first', async () => {
    const client = await connectClient(api);
    const noPr = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 7 } });
    expect(noPr.isError).toBe(true);
    expect(textOf(noPr)).toContain('PR #7 was not found in repo "acme/api"');
    const noRepo = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'x/y', pr: 42 } });
    expect(textOf(noRepo)).toContain('No repo matching "x/y"');
    const badPr = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/api', pr: 0 } });
    expect(badPr.isError).toBe(true);
  });
});
