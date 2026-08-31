import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';

/**
 * INTENTIONAL STUB. `repoIntel.getBlastRadius()` already exists server-side
 * (`server/src/modules/repo-intel/service.ts`) but has no HTTP route yet —
 * wrapping it for real is a later lesson's homework. This handler makes zero
 * network calls; it only validates input and returns a typed
 * "not implemented" result. `isError: true` (not a protocol-level error) so
 * the calling agent gets a normal tool result it can reason about, per the
 * "errors lead forward" principle: don't retry, don't infer.
 *
 * The `client` param is unused on purpose — it's kept in the signature so
 * every tool's `register*` function has the same shape (see `tools/index.ts`).
 */
const inputSchema = {
  repo: z.string().describe("Repo full name, e.g. 'owner/name'"),
  pr: z.number().int().positive().describe('PR number'),
};

export function registerGetBlastRadiusTool(server: McpServer, _client: ApiClient): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        'NOT IMPLEMENTED YET — reserved for a future lesson. Always returns an error result; ' +
        'do not call this expecting real blast-radius data.',
      inputSchema,
    },
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'get_blast_radius is not implemented yet (planned for a later lesson). ' +
              'Do not retry this call and do not infer blast-radius data from ' +
              'list_agents, get_findings, or get_conventions — none of them carry it.',
          },
        ],
        isError: true,
      };
    },
  );
}
