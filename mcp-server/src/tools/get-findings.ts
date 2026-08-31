import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import { resolvePr, resolveRepo, ToolInputError } from '../resolve.js';
import { shapeReviewRecord, shapeRunStatus } from '../shape.js';
import type { ReviewRecord, RunSummary } from '../types.js';

const inputSchema = {
  repo: z.string().describe("Repo full name, e.g. 'owner/name'"),
  pr: z.number().int().positive().describe('PR number'),
  run_id: z
    .string()
    .optional()
    .describe('A run id from list output or run_agent_on_pr. Omit to use the most recent run.'),
};

/** Picks the target run: the one matching `run_id`, or the most recent by `ran_at`. */
function pickRun(runs: RunSummary[], runId: string | undefined): RunSummary | undefined {
  if (runId) return runs.find((r) => r.run_id === runId);
  return [...runs].sort((a, b) => (b.ran_at ?? '').localeCompare(a.ran_at ?? ''))[0];
}

export function registerGetFindingsTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'get_findings',
    {
      description:
        'Returns the compact {verdict, findings[]} result of an already-completed review run. ' +
        'Does not trigger a new run — use run_agent_on_pr for that.',
      inputSchema,
    },
    async ({ repo, pr, run_id }) => {
      try {
        const repoRow = await resolveRepo(client, repo);
        const prRow = await resolvePr(client, repoRow.id, pr);

        const runs = await client.get<RunSummary[]>(`/pulls/${prRow.id}/runs`);
        const run = pickRun(runs, run_id);
        if (!run) {
          return {
            content: [
              {
                type: 'text' as const,
                text: run_id
                  ? `no run '${run_id}' found on ${repo}#${pr} — check the run id`
                  : `${repo}#${pr} has no runs yet — call run_agent_on_pr to start one`,
              },
            ],
            isError: true,
          };
        }

        if (run.status === 'failed' || run.status === 'cancelled') {
          return {
            content: [{ type: 'text' as const, text: `${shapeRunStatus(run)} — call run_agent_on_pr again to retry` }],
            isError: true,
          };
        }

        if (run.status !== 'done') {
          return {
            content: [{ type: 'text' as const, text: `${shapeRunStatus(run)} — check again shortly` }],
            structuredContent: { status: run.status ?? 'unknown', run_id: run.run_id },
          };
        }

        const reviews = await client.get<ReviewRecord[]>(`/pulls/${prRow.id}/reviews`);
        const review = reviews.find((r) => r.run_id === run.run_id);
        if (!review) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `run ${run.run_id} is done but no review was persisted for it — this looks like a server-side bug, not something to retry`,
              },
            ],
            isError: true,
          };
        }

        const shaped = shapeReviewRecord(review);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(shaped) }],
          structuredContent: { ...shaped },
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
