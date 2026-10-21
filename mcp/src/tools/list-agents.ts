import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Agent } from '@devdigest/shared';
import { toToolError, toToolResult } from '../errors.js';
import { shapeAgents } from '../format.js';
import type { ToolDeps, ToolExtra } from './types.js';

export const NAME = 'devdigest_list_agents';
export const TITLE = 'list_agents';
export const DESCRIPTION =
  'List the reviewer agents configured in DevDigest with their id, name, model and whether they are enabled. ' +
  'Call this first to get a valid agent_id for devdigest_run_agent_on_pr. ' +
  'Disabled agents are hidden unless include_disabled is true. ' +
  'Does not return agent prompts or past findings.';

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    NAME,
    {
      title: TITLE,
      description: DESCRIPTION,
      inputSchema: {
        include_disabled: z.boolean().default(false).describe('Also list disabled agents'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ include_disabled }, extra: ToolExtra) => {
      try {
        const agents = await deps.api.get<Agent[]>('/agents', extra.signal);
        return toToolResult({ agents: shapeAgents(agents, include_disabled) });
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
