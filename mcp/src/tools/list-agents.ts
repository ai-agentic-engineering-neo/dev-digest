import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { guarded } from '../errors.js';
import { ok, type ToolDeps } from './shared.js';

// Field names follow the task contract (id, name, description, model, enabled) so clients and tests need no mapping.
const Output = z.object({
  agents: z.array(
    z.object({ id: z.string(), name: z.string(), description: z.string(), model: z.string(), enabled: z.boolean() }),
  ),
});
type Output = z.infer<typeof Output>;

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest reviewer agents',
      description:
        'List the reviewer agents configured in DevDigest (id, name, description, model, enabled). Call it first and pass an agent\'s id as agent_id to run_agent_on_pr.',
      outputSchema: Output.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('list_agents', async (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
      const agents = await deps.api.listAgents(extra.signal);
      const data: Output = {
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          // the agent's description, never its system prompt
          description: a.description,
          model: a.model,
          enabled: a.enabled,
        })),
      };
      const text =
        data.agents.length === 0
          ? 'No agents configured in DevDigest. Create one in the DevDigest UI (Agents).'
          : data.agents
              .map((a) => `- ${a.name} [id ${a.id}] · ${a.model}${a.enabled ? '' : ' (disabled)'} — ${a.description}`)
              .join('\n');
      return ok(data, text);
    }),
  );
}
