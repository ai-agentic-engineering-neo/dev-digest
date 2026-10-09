import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestHttpClient } from '../http/client.js';
import { DevDigestApiError, commonErrorMessage, isRateLimited } from '../http/errors.js';
import { resolveRepo } from '../resolvers/repo.js';
import { resolvePull, PullNotFoundError, formatPullNotFoundMessage } from '../resolvers/pull.js';
import { readRunEvents } from '../http/sse.js';
import { toReviewResult, type RawReviewRecord } from './review-shape.js';

export const runAgentOnPrInputSchema = z.object({
  repo: z.string().min(1).describe(
    'Repository identifier: "owner/name", or just "name" if it is unambiguous in this workspace.',
  ),
  pr: z.number().int().positive().describe(
    'The pull request number as shown in the Dev Digest UI / GitHub (not an internal id).',
  ),
  agent: z.string().min(1).describe('An agent id, as returned by list_agents.'),
});
export type RunAgentOnPrInput = z.infer<typeof runAgentOnPrInputSchema>;

/** VERBATIM — do not paraphrase, shorten, or "improve" (specs/06-mcp-server.md §3.2). */
export const RUN_AGENT_ON_PR_DESCRIPTION =
  'Runs one review agent against one pull request and blocks until the run finishes, then returns the verdict and findings — creating the run, waiting for it, and fetching the result are all handled inside this single call; you never need to poll or orchestrate multiple tool calls for one review. Use this when the user wants a fresh review from a specific agent. Do not use this to check a review that may already be in progress or already finished — use get_findings for that; calling this again just starts another run. Blocks for up to 120 seconds. If the agent is still running when that limit hits, this returns a timeout notice (not the result) — the run keeps going in the background, so call get_findings shortly after to pick it up. Returns a concise verdict plus the finding list (severity, file, lines, one-line rationale); it never returns full prompt/trace internals, token usage, or cost.';

/** ~118s of the 120s budget — the remaining ~2s is reserved for the final
 *  status + review GETs that only run once the SSE stream has closed. */
export const SSE_WAIT_BUDGET_MS = 118_000;

interface RawRunTarget {
  run_id: string;
  agent_id: string;
  agent_name: string;
}
interface RawReviewRunResponse {
  pr_id: string;
  runs: RawRunTarget[];
  reviews: unknown[];
}
interface RawRunSummary {
  run_id: string;
  status: string | null;
  error: string | null;
}

/** The slice of the SDK's `RequestHandlerExtra` this handler needs — kept
 *  narrow and locally-typed so this module (and its tests) don't need to
 *  import the full SDK request-handler surface; `tools/index.ts` passes the
 *  real `extra` object, which satisfies this structurally. */
export interface ToolCallExtra {
  _meta?: { progressToken?: string | number };
  sendNotification?: (notification: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; total?: number; message?: string };
  }) => Promise<void>;
}

export interface RunAgentOnPrDeps {
  http: DevDigestHttpClient;
  apiBaseUrl: string;
  /** Injectable override for tests — production always uses SSE_WAIT_BUDGET_MS. */
  sseWaitBudgetMs?: number;
}

export function makeRunAgentOnPrHandler(deps: RunAgentOnPrDeps) {
  const { http, apiBaseUrl } = deps;
  const sseWaitBudgetMs = deps.sseWaitBudgetMs ?? SSE_WAIT_BUDGET_MS;

  return async (input: RunAgentOnPrInput, extra: ToolCallExtra = {}): Promise<CallToolResult> => {
    try {
      const repo = await resolveRepo(http, input.repo);

      let pull;
      try {
        pull = await resolvePull(http, repo.id, input.pr);
      } catch (err) {
        if (err instanceof PullNotFoundError) {
          return errorResult(formatPullNotFoundMessage(err, repo.full_name));
        }
        throw err;
      }

      // Step 3: create the run. Rate-limited 10/min server-side.
      let runResponse: RawReviewRunResponse;
      try {
        runResponse = await http.post<RawReviewRunResponse>(`/pulls/${pull.id}/review`, {
          agentId: input.agent,
        });
      } catch (err) {
        // 429 MUST be detected by HTTP status, never by error.code — the
        // backend mislabels it as "internal_error" (see http/errors.ts).
        if (isRateLimited(err)) {
          return errorResult(
            'Rate limited: more than 10 review runs were requested in the last minute. Wait a bit and call run_agent_on_pr again.',
          );
        }
        if (err instanceof DevDigestApiError && err.status === 404 && err.code === 'not_found') {
          return errorResult(`Agent '${input.agent}' not found. Call list_agents to see valid agent ids.`);
        }
        throw err;
      }

      const target = runResponse.runs[0];
      if (!target) {
        return errorResult(`Agent '${input.agent}' not found. Call list_agents to see valid agent ids.`);
      }

      // Step 4: hold the SSE connection open until it closes (the race-free
      // completion signal) or the wait budget is exhausted.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), sseWaitBudgetMs);
      try {
        const stream = await http.openEventStream(`/runs/${target.run_id}/events`, controller.signal);
        const progressToken = extra._meta?.progressToken;
        try {
          for await (const event of readRunEvents(stream)) {
            if (progressToken !== undefined && extra.sendNotification) {
              await extra.sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: event.seq, message: event.msg },
              });
            }
          }
        } catch (err) {
          // A signal-driven abort surfaces here as a rejected read — that's
          // the expected timeout path, handled below via signal.aborted.
          if (!controller.signal.aborted) throw err;
        }
      } finally {
        clearTimeout(timer);
      }

      if (controller.signal.aborted) {
        return errorResult(
          'Timed out after 120s waiting for the review to finish. The run may still be finishing in the background — call get_findings(repo, pr, agent) in a bit to check for the result.',
        );
      }

      // Steps 5-6: the SSE stream closed normally -> the run is done (or
      // failed/cancelled) per RunBus.complete()'s guarantee. Confirm via
      // the run's persisted status, then fetch the matching review.
      const runs = await http.get<RawRunSummary[]>(`/pulls/${pull.id}/runs`);
      const runSummary = runs.find((r) => r.run_id === target.run_id);

      if (!runSummary) {
        return errorResult(
          `Could not find this run's status after it finished (run_id ${target.run_id}). Call get_findings(repo, pr, agent) to check for a result.`,
        );
      }
      if (runSummary.status === 'failed') {
        return errorResult(
          `Agent run failed: ${runSummary.error ?? 'unknown error'}. If this mentions a missing API key, add the provider key in Settings, then retry run_agent_on_pr.`,
        );
      }
      if (runSummary.status === 'cancelled') {
        return errorResult('The run was cancelled (possibly from the web UI). Call run_agent_on_pr again to retry.');
      }
      if (runSummary.status !== 'done') {
        return errorResult(
          `Agent run did not finish as expected (status: ${runSummary.status ?? 'unknown'}). Call get_findings(repo, pr, agent) in a bit to check for the result.`,
        );
      }

      // status === 'done': find the ReviewRecord whose run_id EXACTLY
      // matches this run — never "latest for this agent", to avoid a race
      // with a concurrently-triggered second run.
      const reviews = await http.get<RawReviewRecord[]>(`/pulls/${pull.id}/reviews`);
      const review = reviews.find((r) => r.run_id === target.run_id);
      if (!review) {
        return errorResult(
          `The run finished but no review record was found for run_id ${target.run_id}. Call get_findings(repo, pr, agent) to check for a result.`,
        );
      }
      const result = toReviewResult(review);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      if (err instanceof Error && (err.name === 'RepoNotFoundError' || err.name === 'AmbiguousRepoError')) {
        return errorResult(err.message);
      }
      return errorResult(commonErrorMessage(err, apiBaseUrl));
    }
  };
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}
