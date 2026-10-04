// Ring 4. Thin: zod input -> service -> MCP result.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import type { ReviewService } from '../services/review-service.js';
import { toolResult } from './result.js';
import { prField, repoField } from './schemas.js';

export const GET_FINDINGS_NAME = 'get_findings';
export const GET_FINDINGS_DESCRIPTION = 'Get the verdict and findings from a specific completed review run.';

export function registerGetFindings(
  server: McpServer,
  deps: { reviews: ReviewService; baseUrl: string },
): void {
  server.registerTool(
    GET_FINDINGS_NAME,
    {
      description: GET_FINDINGS_DESCRIPTION,
      inputSchema: {
        repo: repoField,
        pr: prField,
        run_id: z.string().uuid().describe('Run id returned by run_agent_on_pr.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe('Maximum number of findings to return, most severe first (1-50, default 20).'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    (args) =>
      toolResult({ baseUrl: deps.baseUrl, tool: GET_FINDINGS_NAME }, () =>
        deps.reviews.getFindings({ repo: args.repo, pr: args.pr, runId: args.run_id, limit: args.limit }),
      ),
  );
}
