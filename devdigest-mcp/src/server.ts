// Ring 4. Builds the McpServer from an already-wired port (no IO, no env), so
// tests can drive it over an in-memory transport. index.ts does the real wiring.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './domain/ports.js';
import { AgentsService } from './services/agents-service.js';
import { registerListAgents } from './tools/list-agents.js';

export function createMcpServer(deps: { api: DevDigestApi; baseUrl: string }): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  registerListAgents(server, { agents: new AgentsService(deps.api), baseUrl: deps.baseUrl });
  return server;
}
