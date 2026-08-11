import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { listAgentsInputSchema, LIST_AGENTS_DESCRIPTION, makeListAgentsHandler } from './list-agents.js';
import {
  runAgentOnPrInputSchema,
  RUN_AGENT_ON_PR_DESCRIPTION,
  makeRunAgentOnPrHandler,
} from './run-agent-on-pr.js';
import { getFindingsInputSchema, GET_FINDINGS_DESCRIPTION, makeGetFindingsHandler } from './get-findings.js';
import {
  getConventionsInputSchema,
  GET_CONVENTIONS_DESCRIPTION,
  makeGetConventionsHandler,
} from './get-conventions.js';
import {
  getBlastRadiusInputSchema,
  GET_BLAST_RADIUS_DESCRIPTION,
  makeGetBlastRadiusHandler,
} from './get-blast-radius.js';

/**
 * Registers all 5 tools on `server`, in a FIXED order, with static
 * description strings and schemas. Registration order and description text
 * must stay byte-identical across calls within a session — reordering or
 * varying either invalidates the Anthropic-side prompt cache for `tools`
 * (specs/06-mcp-server.md "Caching implications"). Don't reorder this list.
 */
export function registerTools(server: McpServer, http: DevDigestHttpClient, apiBaseUrl: string): void {
  server.registerTool(
    'list_agents',
    { description: LIST_AGENTS_DESCRIPTION, inputSchema: listAgentsInputSchema.shape },
    makeListAgentsHandler(http, apiBaseUrl),
  );

  server.registerTool(
    'run_agent_on_pr',
    { description: RUN_AGENT_ON_PR_DESCRIPTION, inputSchema: runAgentOnPrInputSchema.shape },
    makeRunAgentOnPrHandler({ http, apiBaseUrl }),
  );

  server.registerTool(
    'get_findings',
    { description: GET_FINDINGS_DESCRIPTION, inputSchema: getFindingsInputSchema.shape },
    makeGetFindingsHandler(http, apiBaseUrl),
  );

  server.registerTool(
    'get_conventions',
    { description: GET_CONVENTIONS_DESCRIPTION, inputSchema: getConventionsInputSchema.shape },
    makeGetConventionsHandler(http, apiBaseUrl),
  );

  server.registerTool(
    'get_blast_radius',
    { description: GET_BLAST_RADIUS_DESCRIPTION, inputSchema: getBlastRadiusInputSchema.shape },
    makeGetBlastRadiusHandler(http, apiBaseUrl),
  );
}
