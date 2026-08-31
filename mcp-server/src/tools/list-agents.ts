import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import type { AgentSummary } from '../types.js';

/** Defensive cap — a workspace realistically has a handful of agents. */
const MAX_AGENTS = 100;

export function registerListAgentsTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_agents',
    {
      description:
        "Lists DevDigest's configured reviewer agents. The returned `id` is what " +
        "run_agent_on_pr's `agent` argument expects.",
    },
    async () => {
      try {
        const agents = await client.get<AgentSummary[]>('/agents');
        const trimmed = agents.slice(0, MAX_AGENTS).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(trimmed) }],
          structuredContent: { agents: trimmed },
        };
      } catch (err) {
        const message =
          err instanceof ApiCallError
            ? `DevDigest API error (${err.code}): ${err.message}`
            : 'DevDigest API unreachable — is ./scripts/dev.sh running?';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
  );
}
