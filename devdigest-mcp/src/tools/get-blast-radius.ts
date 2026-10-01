// Ring 4. Thin stub: validates repo/PR, returns a normal not_implemented result.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BlastRadiusService } from '../services/blast-radius-service.js';
import { toolResult } from './result.js';
import { prField, repoField } from './schemas.js';

export const GET_BLAST_RADIUS_NAME = 'get_blast_radius';
export const GET_BLAST_RADIUS_DESCRIPTION =
  'Get the blast radius (impact map) of a pull request — which modules/consumers it affects. Not yet implemented.';

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
