import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { guarded } from '../errors.js';
import { shorten } from '../format.js';
import { ok, type ToolDeps } from './shared.js';

const ROLE_MAX = 160;

const Output = z.object({
  agents: z.array(
    z.object({ agent_id: z.string(), name: z.string(), model: z.string(), role: z.string(), enabled: z.boolean() }),
  ),
});
type Output = z.infer<typeof Output>;

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest reviewer agents',
      description:
        'List the reviewer agents configured in DevDigest (agent_id, name, model, role). Call it first to pick the agent_id for run_agent_on_pr.',
      outputSchema: Output.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('list_agents', async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const agents = await deps.api.listAgents(extra.signal);
      const data: Output = {
        agents: agents.map((a) => ({
          agent_id: a.id,
          name: a.name,
          model: a.model,
          // one line, never a system prompt
          role: shorten(a.description, ROLE_MAX),
          enabled: a.enabled,
        })),
      };
      const text =
        data.agents.length === 0
          ? 'No agents configured in DevDigest. Create one in the DevDigest UI (Agents).'
          : data.agents
              .map((a) => `- ${a.name} [agent_id ${a.agent_id}] · ${a.model}${a.enabled ? '' : ' (disabled)'} — ${a.role}`)
              .join('\n');
      return ok(data, text);
    }),
  );
}
