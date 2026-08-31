import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { registerGetBlastRadiusTool } from './get-blast-radius.js';
import { registerGetConventionsTool } from './get-conventions.js';
import { registerGetFindingsTool } from './get-findings.js';
import { registerListAgentsTool } from './list-agents.js';
import { registerRunAgentOnPrTool } from './run-agent-on-pr.js';

/** Central registration point — each tool file only ever touches its own file. */
export function registerAllTools(server: McpServer, client: ApiClient): void {
  registerListAgentsTool(server, client);
  registerGetConventionsTool(server, client);
  registerGetBlastRadiusTool(server, client);
  registerGetFindingsTool(server, client);
  registerRunAgentOnPrTool(server, client);
}
