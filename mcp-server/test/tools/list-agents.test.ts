import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { listAgentsInputSchema, makeListAgentsHandler } from '../../src/tools/list-agents.js';

function clientReturning(status: number, body: unknown) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
}

describe('list_agents input schema', () => {
  it('accepts an empty object (zero-argument tool)', () => {
    expect(listAgentsInputSchema.safeParse({}).success).toBe(true);
  });
});

describe('list_agents handler', () => {
  it('returns the shaped agent list, dropping internal-only fields', async () => {
    const http = clientReturning(200, [
      {
        id: 'a1',
        name: 'Bug Hunter',
        provider: 'anthropic',
        model: 'claude-opus',
        enabled: true,
        description: 'internal',
        system_prompt: 'internal',
        output_schema: {},
        version: 3,
        strategy: 'single-pass',
        ci_fail_on: 'critical',
        repo_intel: true,
      },
    ]);
    const handler = makeListAgentsHandler(http, 'http://localhost:3001');
    const result = await handler();
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
    expect(parsed).toEqual({
      agents: [{ id: 'a1', name: 'Bug Hunter', model: 'claude-opus', enabled: true }],
    });
  });

  it('drops provider from the response even though the backend record has it', async () => {
    const http = clientReturning(200, [
      { id: 'a1', name: 'Bug Hunter', provider: 'anthropic', model: 'claude-opus', enabled: true },
    ]);
    const handler = makeListAgentsHandler(http, 'http://localhost:3001');
    const result = await handler();
    const parsed = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
    expect(parsed.agents[0]).not.toHaveProperty('provider');
  });

  it('includes disabled agents', async () => {
    const http = clientReturning(200, [
      { id: 'a1', name: 'Off', provider: 'openai', model: 'gpt', enabled: false },
    ]);
    const handler = makeListAgentsHandler(http, 'http://localhost:3001');
    const result = await handler();
    const parsed = JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
    expect(parsed.agents[0].enabled).toBe(false);
  });

  it('returns isError with an unreachable-API message when fetch fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeListAgentsHandler(http, 'http://localhost:3001');
    const result = await handler();
    expect(result.isError).toBe(true);
    const text = (result.content as { type: 'text'; text: string }[])[0]!.text;
    expect(text).toContain('Cannot reach the Dev Digest API');
  });
});
