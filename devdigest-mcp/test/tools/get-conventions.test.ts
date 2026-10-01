import { afterEach, describe, expect, it } from 'vitest';
import type { ConventionCandidate, Repo } from '@devdigest/shared';
import { closeClients, connectClient, conventionFixture, fakePort, repoFixture, textOf } from '../helpers/fixtures.js';

afterEach(closeClients);

const repos = [repoFixture()] as unknown as Repo[];

function port(conventions: Record<string, unknown>[]) {
  return fakePort({
    listRepos: async () => repos,
    listConventions: async () => conventions as unknown as ConventionCandidate[],
  });
}

describe('get_conventions tool', () => {
  it('registers verbatim and filters accepted, sorts by confidence, caps snippets', async () => {
    const client = await connectClient(
      port([
        conventionFixture({ id: 'a', rule: 'low', confidence: 0.2 }),
        conventionFixture({ id: 'b', rule: 'high', confidence: 0.95, evidence_snippet: 'x'.repeat(500) }),
        conventionFixture({ id: 'c', rule: 'pending', accepted: false }),
      ]),
    );
    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_conventions')!;
    expect(tool.description).toBe("Get this repo's accepted coding conventions (naming, structure, etc.) with evidence.");
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });

    const res = await client.callTool({ name: 'get_conventions', arguments: { repo: 'ACME/api' } });
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(textOf(res));
    expect(data).toMatchObject({ repo: 'acme/api', total: 2, returned: 2, truncated: false });
    expect(data.conventions.map((c: { rule: string }) => c.rule)).toEqual(['high', 'low']);
    expect(data.conventions[0].evidence_snippet.length).toBe(300);
    expect(data.hint).toBeUndefined();

    const withPending = JSON.parse(
      textOf(await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/api', includePending: true } })),
    );
    expect(withPending.total).toBe(3);
  });

  it('applies limit with truncated, and returns a hint (not an error) when empty', async () => {
    const many = Array.from({ length: 5 }, (_, i) => conventionFixture({ id: `c${i}`, confidence: i / 10 }));
    const client = await connectClient(port(many));
    const limited = JSON.parse(
      textOf(await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/api', limit: 2 } })),
    );
    expect(limited).toMatchObject({ total: 5, returned: 2, truncated: true });

    const empty = await (await connectClient(port([]))).callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/api' },
    });
    expect(empty.isError).toBeFalsy();
    expect(JSON.parse(textOf(empty)).hint).toContain('DevDigest UI');
  });

  it('reports an unknown repo with a forward-looking message and rejects bad repo input', async () => {
    const client = await connectClient(port([]));
    const res = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/missing' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('No repo matching "acme/missing"');
    const bad = await client.callTool({ name: 'get_conventions', arguments: { repo: 'http://evil/x' } });
    expect(bad.isError).toBe(true);
  });
});
