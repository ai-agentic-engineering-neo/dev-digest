// Ring 4. Thin: resolves repo/PR and returns the server's blast-radius payload.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BlastRadiusService } from '../services/blast-radius-service.js';
import { toolResult } from './result.js';
import { prField, repoField } from './schemas.js';

export const GET_BLAST_RADIUS_NAME = 'get_blast_radius';
export const GET_BLAST_RADIUS_DESCRIPTION =
  'Get the blast radius of a pull request: changed symbols, downstream callers (file:line), affected endpoints and crons, and whether the repo index was degraded.';

export function registerGetBlastRadius(
  server: McpServer,
  deps: { blast: BlastRadiusService; baseUrl: string },
): void {
  server.registerTool(
    GET_BLAST_RADIUS_NAME,
    {
      description: GET_BLAST_RADIUS_DESCRIPTION,
      inputSchema: { repo: repoField, pr: prField },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    (args) =>
      toolResult({ baseUrl: deps.baseUrl, tool: GET_BLAST_RADIUS_NAME }, () =>
        deps.blast.getBlastRadius({ repo: args.repo, pr: args.pr }),
      ),
  );
}
