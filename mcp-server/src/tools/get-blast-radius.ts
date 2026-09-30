import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import { resolvePr, resolveRepo, ToolInputError } from '../resolve.js';
import type { BlastRadius } from '../types.js';

/**
 * Wraps `GET /pulls/:id/blast` — the `blast/` server module's mapping of
 * `repoIntel.getBlastRadius()` into the shared `BlastRadius` shape (changed
 * symbols -> callers -> impacted endpoints/crons). Deterministic and
 * read-only: no run to wait on, no LLM call. Same resolve-then-fetch shape as
 * `get_findings` and `get_conventions`.
 */
const inputSchema = {
  repo: z.string().describe("Repo full name, e.g. 'owner/name'"),
  pr: z.number().int().positive().describe('PR number'),
};

export function registerGetBlastRadiusTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        'Returns changed symbols for a PR, their resolved callers (file:line), and the HTTP ' +
        'endpoints/cron jobs reachable from those changes — sourced from the repo index, not the ' +
        'model. Requires the repo to be indexed; a partial index is called out in `summary` rather ' +
        'than silently returning an empty result.',
      inputSchema,
    },
    async ({ repo, pr }) => {
      try {
        const repoRow = await resolveRepo(client, repo);
        const prRow = await resolvePr(client, repoRow.id, pr);

        const result = await client.get<BlastRadius>(`/pulls/${prRow.id}/blast`);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: { ...result },
        };
      } catch (err) {
        if (err instanceof ToolInputError) {
          return { content: [{ type: 'text' as const, text: err.message }], isError: true };
        }
        const message =
          err instanceof ApiCallError
            ? `DevDigest API error (${err.code}): ${err.message}`
            : 'DevDigest API unreachable — is ./scripts/dev.sh running?';
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
  );
}
