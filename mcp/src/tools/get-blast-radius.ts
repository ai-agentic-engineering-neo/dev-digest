import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { resolvePull, resolveRepo } from '../api/resolve.js';
import { toToolError, toToolResult } from '../errors.js';
import { shapeBlastRadius } from '../format.js';
import { RepoSchema } from '../schemas.js';
import type { ToolDeps, ToolExtra } from './types.js';

export const NAME = 'devdigest_get_blast_radius';
export const TITLE = 'get_blast_radius';
export const DESCRIPTION =
  'Return the impact map of a pull request from the DevDigest repo index: the symbols declared in the changed files, the downstream callers of each with file and line, the HTTP endpoints and cron jobs those callers reach, and prior PRs that touched the same files. ' +
  'Identify the PR by repo (name or owner/name) and pr_number. ' +
  'When the repository has no usable index the result is degraded, with the reason and a note saying what would help. ' +
  'Read-only and free: no review runs and no model call.';

export function register(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    NAME,
    {
      title: TITLE,
      description: DESCRIPTION,
      inputSchema: {
        repo: RepoSchema,
        pr_number: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ repo, pr_number }, extra: ToolExtra) => {
      try {
        const r = await resolveRepo(deps.api, repo, extra.signal);
        const pr = await resolvePull(deps.api, r.id, pr_number, extra.signal);
        const data = await deps.api.get<BlastRadiusResponse>(`/pulls/${pr.id}/blast`, extra.signal);
        return toToolResult(shapeBlastRadius(r.full_name, pr.number, data));
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
