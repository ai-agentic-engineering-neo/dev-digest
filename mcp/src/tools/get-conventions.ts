import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ConventionsView } from '@devdigest/shared';
import { resolveRepo } from '../api/resolve.js';
import { toToolError, toToolResult } from '../errors.js';
import { shapeConventions } from '../format.js';
import { RepoSchema } from '../schemas.js';
import type { ToolDeps, ToolExtra } from './types.js';

export const NAME = 'devdigest_get_conventions';
export const TITLE = 'get_conventions';
export const DESCRIPTION =
  'Return the coding conventions DevDigest extracted for a repository (the rules behind the repo-conventions skill), each with category and an evidence file:line. ' +
  'Defaults to the rules a human accepted; pass status candidate, rejected or all to see the others. ' +
  'Identify the repository by name or owner/name. ' +
  'Does not run a new scan.';

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    NAME,
    {
      title: TITLE,
      description: DESCRIPTION,
      inputSchema: {
        repo: RepoSchema,
        status: z.enum(['accepted', 'candidate', 'rejected', 'all']).default('accepted'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ repo, status }, extra: ToolExtra) => {
      try {
        const r = await resolveRepo(deps.api, repo, extra.signal);
        const view = await deps.api.get<ConventionsView>(`/repos/${r.id}/conventions`, extra.signal);
        return toToolResult(shapeConventions(r.full_name, view, status));
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
