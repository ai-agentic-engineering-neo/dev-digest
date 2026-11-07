import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { guarded } from '../errors.js';
import { ok, prArg, repoArg, type ToolDeps } from './shared.js';

const Output = z.object({
  status: z.literal('not_implemented'),
  repo: z.string(),
  pr: z.number().int(),
  message: z.string(),
});

const MESSAGE =
  'Blast radius is not implemented yet: DevDigest has no HTTP endpoint for it. No impact data is available — ' +
  'do not infer one; read the PR diff instead.';

/** Honest stub: makes no API call and never invents impact data. */
export function registerGetBlastRadius(server: McpServer, _deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get PR blast radius (not implemented)',
      description: 'Impact map of a PR (callers of changed symbols). Not implemented yet: always returns status "not_implemented".',
      inputSchema: { repo: repoArg, pr: prArg },
      outputSchema: Output.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('get_blast_radius', async ({ repo, pr }) =>
      ok({ status: 'not_implemented' as const, repo, pr, message: MESSAGE }, MESSAGE),
    ),
  );
}
