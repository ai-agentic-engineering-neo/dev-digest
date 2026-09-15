import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../client.js';
import { ApiCallError } from '../client.js';
import { resolvePr, resolveRepo, ToolInputError } from '../resolve.js';
import { shapeReviewRecord, shapeRunStatus } from '../shape.js';
import type { ReviewRecord, ReviewRunResponse, RunSummary } from '../types.js';

const inputSchema = {
  repo: z.string().describe("Repo full name, e.g. 'owner/name'"),
  pr: z.number().int().positive().describe('PR number'),
  // DB-backed (uuid column) — constraining here rejects a malformed id at the
  // schema boundary with a clear validation error, instead of it reaching the
  // backend as a raw Postgres "invalid input syntax for type uuid" 500.
  agent: z.string().uuid().describe('An agent id (uuid), as returned by list_agents'),
};

/**
 * Bounded wall-clock budget for the internal poll loop. MCP clients commonly
 * enforce an implicit ~7-10s tool-call timeout, so this stays comfortably
 * under that — hitting the "still running" branch is the EXPECTED common
 * case (a real review routinely takes longer than this), not an edge case.
 */
function pollIntervalMs(): number {
  return Number(process.env.POLL_INTERVAL_MS ?? 1000);
}
function pollMaxMs(): number {
  return Number(process.env.POLL_MAX_MS ?? 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerRunAgentOnPrTool(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        'Runs one agent on a PR and returns the finished {verdict, findings[]} — starts the ' +
        'review, waits for it, and hands back the result in a single call. The only tool that ' +
        "mutates state. If the review is still running when this tool's wait budget runs out, " +
        'returns a run_id to check later with get_findings instead of the findings themselves.',
      inputSchema,
    },
    async ({ repo, pr, agent }) => {
      try {
        const repoRow = await resolveRepo(client, repo);
        const prRow = await resolvePr(client, repoRow.id, pr);

        let started: ReviewRunResponse;
        try {
          started = await client.post<ReviewRunResponse>(`/pulls/${prRow.id}/review`, {
            agentId: agent,
          });
        } catch (err) {
          if (err instanceof ApiCallError && err.code === 'not_found') {
            return {
              content: [
                { type: 'text' as const, text: `agent '${agent}' not found — call list_agents to see valid ids` },
              ],
              isError: true,
            };
          }
          throw err;
        }

        const target = started.runs[0];
        if (!target) {
          return {
            content: [{ type: 'text' as const, text: 'DevDigest did not start a run — this looks like a server-side bug' }],
            isError: true,
          };
        }

        const deadline = Date.now() + pollMaxMs();
        let run: RunSummary | undefined;
        while (Date.now() < deadline) {
          const runs = await client.get<RunSummary[]>(`/pulls/${prRow.id}/runs`);
          run = runs.find((r) => r.run_id === target.run_id);
          if (run && run.status !== 'running') break;
          await sleep(pollIntervalMs());
        }

        if (!run || run.status === 'running') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `still running after ${pollMaxMs()}ms — call get_findings(repo: '${repo}', pr: ${pr}, run_id: '${target.run_id}') to check later.`,
              },
            ],
            structuredContent: {
              status: 'running',
              run_id: target.run_id,
              pr_id: prRow.id,
            },
          };
        }

        if (run.status === 'failed' || run.status === 'cancelled') {
          return {
            content: [{ type: 'text' as const, text: `${shapeRunStatus(run)} — retry by calling run_agent_on_pr again` }],
            isError: true,
          };
        }

        const reviews = await client.get<ReviewRecord[]>(`/pulls/${prRow.id}/reviews`);
        const review = reviews.find((r) => r.run_id === run!.run_id);
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
