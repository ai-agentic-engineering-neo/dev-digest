import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Agent } from '@devdigest/shared';
import { ApiError, type DevDigestApi } from '../../src/domain/ports.js';
import { createMcpServer } from '../../src/server.js';
import { withHealthGate } from '../../src/services/health-gate.js';
import { agentFixture } from '../helpers/fake-api.js';

const BASE = 'http://127.0.0.1:3001';

function fakePort(over: Partial<DevDigestApi>): DevDigestApi {
  const nope = (): never => {
    throw new Error('unexpected port call');
  };
  return {
    health: async () => undefined,
    listAgents: nope,
    listRepos: nope,
    listPulls: nope,
    listConventions: nope,
    startReview: nope,
    listRuns: nope,
    listReviews: nope,
    waitForRunEnd: nope,
    ...over,
  };
}

const clients: Client[] = [];
async function connect(api: DevDigestApi): Promise<Client> {
  const server = createMcpServer({ api: withHealthGate(api), baseUrl: BASE });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  clients.push(client);
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text: string }[];
  return content[0]?.text ?? '';
}

describe('list_agents tool', () => {
  it('registers verbatim description and annotations, ', async () => {
    const client = await connect(fakePort({}));
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'list_agents')!;
    expect(tool.description).toBe(
      'List the review agents configured in this workspace, with the agent id other tools need.',
    );
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it('returns only trimmed fields and never the system prompt', async () => {
    const agents = [
      agentFixture(),
      agentFixture({ id: '22222222-2222-4222-8222-222222222222', name: 'Off', enabled: false }),
    ] as unknown as Agent[];
    const client = await connect(fakePort({ listAgents: async () => agents }));
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).not.toContain('TOP SECRET');
    expect(text).not.toContain('system_prompt');
    const data = JSON.parse(text) as { agents: Record<string, unknown>[] };
    expect(data.agents).toHaveLength(2);
    expect(Object.keys(data.agents[0]!).sort()).toEqual(['enabled', 'id', 'model', 'name', 'provider']);
    expect(data.agents[1]!.enabled).toBe(false);
  });

  it('maps an ApiError to isError with a forward-looking message and no leaks', async () => {
    const client = await connect(
      fakePort({
        listAgents: async () => {
          throw new ApiError({ kind: 'unreachable', endpoint: '/agents' });
        },
      }),
    );
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(`not reachable at ${BASE}`);
    expect(textOf(result)).toContain('./scripts/dev.sh');
  });

  it('turns an unexpected throw into a generic error without the raw message or stack', async () => {
    const client = await connect(
      fakePort({
        listAgents: async () => {
          throw new Error('SECRET_INTERNAL boom');
        },
      }),
    );
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain('SECRET_INTERNAL');
  });

  it('health gate: probes lazily, caches success, retries after failure', async () => {
    let healthCalls = 0;
    let healthy = false;
    const api = fakePort({
      health: async () => {
        healthCalls++;
        if (!healthy) throw new ApiError({ kind: 'not_api', endpoint: '/health' });
      },
      listAgents: async () => [],
    });
    const client = await connect(api);
    expect(healthCalls).toBe(0);
    const first = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(first.isError).toBe(true);
    expect(textOf(first)).toContain('web UI');
    healthy = true;
    expect((await client.callTool({ name: 'list_agents', arguments: {} })).isError).toBeFalsy();
    await client.callTool({ name: 'list_agents', arguments: {} });
    expect(healthCalls).toBe(2); // 1 failed + 1 ok, then cached
  });
});
