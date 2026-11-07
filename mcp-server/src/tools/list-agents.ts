import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { guarded } from '../errors.js';
import { ok, type ToolDeps } from './shared.js';

const ROLE_MAX = 160;

const Output = z.object({
  agents: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string(), enabled: z.boolean() }),
  ),
});

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest reviewer agents',
      description:
        'List the reviewer agents configured in DevDigest (id, name, role). Call it first to pick a valid agent for run_agent_on_pr.',
      outputSchema: Output.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('list_agents', async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const agents = await deps.api.listAgents(extra.signal);
      const data = {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.description.length > ROLE_MAX ? `${a.description.slice(0, ROLE_MAX - 1)}…` : a.description,
          enabled: a.enabled,
        })),
      };
      const text =
        data.agents.length === 0
          ? 'No agents configured in DevDigest. Create one in the DevDigest UI (Agents).'
          : data.agents.map((a) => `- ${a.name}${a.enabled ? '' : ' (disabled)'} — ${a.role}`).join('\n');
      return ok(data, text);
    }),
  );
}
