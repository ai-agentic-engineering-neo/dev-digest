// Ring 4. Thin: zod input -> service -> MCP result. The only write tool.
// Progress: if the client sent a progressToken, each run event is forwarded as
// a notifications/progress (keeps clients with request timeouts reset-able).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import type { ReviewService } from '../services/review-service.js';
import { toolResult } from './result.js';
import { prField, repoField } from './schemas.js';

export const RUN_AGENT_ON_PR_NAME = 'run_agent_on_pr';
export const RUN_AGENT_ON_PR_DESCRIPTION =
  'Run a review agent on a pull request and return its findings once the run finishes (up to ~2 minutes).';

export function registerRunAgentOnPr(
  server: McpServer,
  deps: { reviews: ReviewService; baseUrl: string },
): void {
  server.registerTool(
    RUN_AGENT_ON_PR_NAME,
    {
      description: RUN_AGENT_ON_PR_DESCRIPTION,
      inputSchema: {
        repo: repoField,
        pr: prField,
        agent: z.string().uuid().describe('Agent id from list_agents (must be enabled).'),
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    (args, extra) => {
      const token = extra._meta?.progressToken;
      let count = 0;
      const onProgress =
        token === undefined
          ? undefined
          : (message: string): void => {
              count += 1;
              extra
                .sendNotification({
                  method: 'notifications/progress',
                  params: { progressToken: token, progress: count, message },
                })
                .catch(() => undefined);
            };
      return toolResult({ baseUrl: deps.baseUrl, tool: RUN_AGENT_ON_PR_NAME }, () =>
        deps.reviews.runAgentOnPr(
          { repo: args.repo, pr: args.pr, agent: args.agent },
          { signal: extra.signal, ...(onProgress ? { onProgress } : {}) },
        ),
      );
    },
  );
}
