// Ring 4. Thin: zod input -> service -> MCP result.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import type { ConventionsService } from '../services/conventions-service.js';
import { toolResult } from './result.js';
import { repoField } from './schemas.js';

export const GET_CONVENTIONS_NAME = 'get_conventions';
export const GET_CONVENTIONS_DESCRIPTION =
  "Get this repo's accepted coding conventions (naming, structure, etc.) with evidence.";

export function registerGetConventions(
  server: McpServer,
  deps: { conventions: ConventionsService; baseUrl: string },
): void {
  server.registerTool(
    GET_CONVENTIONS_NAME,
    {
      description: GET_CONVENTIONS_DESCRIPTION,
      inputSchema: {
        repo: repoField,
        includePending: z
          .boolean()
          .default(false)
          .describe('Also return conventions that are not accepted yet (default false).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe('Maximum number of conventions to return, highest confidence first (1-100, default 50).'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    (args) =>
      toolResult({ baseUrl: deps.baseUrl, tool: GET_CONVENTIONS_NAME }, () =>
        deps.conventions.getConventions({
          repo: args.repo,
          includePending: args.includePending,
          limit: args.limit,
        }),
      ),
  );
}
