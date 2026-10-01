// Ring 4. Builds the McpServer from an already-wired port (no IO, no env), so
// tests can drive it over an in-memory transport. index.ts does the real wiring.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './domain/ports.js';
import { AgentsService } from './services/agents-service.js';
import { BlastRadiusService } from './services/blast-radius-service.js';
import { ConventionsService } from './services/conventions-service.js';
import { Resolver } from './services/resolver.js';
import { ReviewService } from './services/review-service.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

/** Hard ceiling and default for a run (decision D2); config may only lower it. */
export const DEFAULT_RUN_TIMEOUT_MS = 120_000;

export function createMcpServer(deps: {
  api: DevDigestApi;
  baseUrl: string;
  runTimeoutMs?: number;
}): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  const { api, baseUrl } = deps;
  const resolver = new Resolver(api);
  const reviews = new ReviewService(api, resolver, deps.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  registerListAgents(server, { agents: new AgentsService(api), baseUrl });
  registerGetConventions(server, { conventions: new ConventionsService(api, resolver), baseUrl });
  registerGetFindings(server, { reviews, baseUrl });
  registerRunAgentOnPr(server, { reviews, baseUrl });
  registerGetBlastRadius(server, { blast: new BlastRadiusService(resolver), baseUrl });
  return server;
}
