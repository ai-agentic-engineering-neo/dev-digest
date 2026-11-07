import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX_CLI = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const DEAD_API = 'http://127.0.0.1:9';

let client: Client;
let transport: StdioClientTransport;
const transportErrors: Error[] = [];
let stderrText = '';

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX_CLI, ENTRY],
    cwd: ROOT,
    env: { ...getDefaultEnvironment(), DEVDIGEST_API_URL: DEAD_API },
    stderr: 'pipe',
  });
  // Any non-JSON line on stdout surfaces here (stdout is reserved for JSON-RPC).
  transport.onerror = (err) => transportErrors.push(err);
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderrText += chunk.toString('utf8');
  });
  client = new Client({ name: 'stdio-smoke', version: '0.0.0' });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
});

describe('stdio smoke (real process)', () => {
  it('lists exactly the 5 tools in the fixed order', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
  }, 30_000);

  it('get_blast_radius answers not_implemented without calling the API', async () => {
    const res = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr: 3 },
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ status: 'not_implemented' });
  }, 30_000);

  it('list_agents reports an unreachable API as a tool error', async () => {
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? '')
      .join('\n');
    expect(text).toContain(`unreachable at ${DEAD_API}`);
  }, 30_000);

  it('keeps stdout clean and logs readiness on stderr', () => {
    expect(stderrText).toContain('[devdigest-mcp] ready');
    expect(transportErrors).toEqual([]);
  });
});
