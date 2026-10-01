// Ring 4. Thin: annotations + description -> service -> MCP result.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentsService } from '../services/agents-service.js';
import { toolResult } from './result.js';

export const LIST_AGENTS_NAME = 'list_agents';
export const LIST_AGENTS_DESCRIPTION =
  'List the review agents configured in this workspace, with the agent id other tools need.';

export function registerListAgents(
  server: McpServer,
  deps: { agents: AgentsService; baseUrl: string },
): void {
  server.registerTool(
    LIST_AGENTS_NAME,
    {
      description: LIST_AGENTS_DESCRIPTION,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    () => toolResult({ baseUrl: deps.baseUrl, tool: LIST_AGENTS_NAME }, () => deps.agents.listAgents()),
  );
}
