import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { DevDigestApi, ApiRun } from '../api-client.js';
import type { Config } from '../config.js';
import { ToolError } from '../errors.js';
import { doneResult, findingsText, type FindingsResult } from '../format.js';

export interface ToolDeps {
  api: DevDigestApi;
  config: Config;
}

export const repoArg = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'Use the "owner/name" format, e.g. "acme/payments-api"')
  .describe('GitHub repository as "owner/name"');

export const prArg = z.coerce.number().int().positive().describe('Pull request number, e.g. 3');

export const agentArg = z.string().min(1).describe('Agent name (case-insensitive) or id from list_agents');

export function ok<T extends Record<string, unknown>>(data: T, text: string): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: data };
}

export function findingsOk(r: FindingsResult): CallToolResult {
  return ok(r, findingsText(r));
}

/** A finished run → its review's findings; failed/cancelled → actionable error. */
export async function finishedRunResult(
  deps: ToolDeps,
  args: { run: ApiRun; prId: string; repo: string; pr: number; warning?: string },
  signal?: AbortSignal,
): Promise<FindingsResult> {
  const { run } = args;
  if (run.status === 'failed') {
    const reason = (run.error ?? 'unknown error').replace(/\s+/g, ' ').trim();
    const short = reason.length > 300 ? `${reason.slice(0, 299)}…` : reason;
    const outOfCredits = /402|credits/i.test(reason);
    throw new ToolError(
      `Review run ${run.run_id} failed: ${short}. ` +
        (outOfCredits
          ? `The LLM provider ran out of credits or the API key's limit. Top up the key or switch the agent's model in DevDigest Settings, then retry run_agent_on_pr.`
          : `Check the agent's provider/model in DevDigest Settings, then retry run_agent_on_pr.`),
    );
  }
  if (run.status === 'cancelled') {
    throw new ToolError(`Review run ${run.run_id} was cancelled. Start a new one with run_agent_on_pr.`);
  }
  const reviews = await deps.api.listReviews(args.prId, signal);
  const review = reviews.find((r) => r.run_id === run.run_id && r.kind === 'review');
  if (!review) {
    throw new ToolError(
      `Run ${run.run_id} finished but its review is not stored yet. Call get_findings with this run_id again.`,
    );
  }
  return doneResult({
    runId: run.run_id,
    repo: args.repo,
    pr: args.pr,
    agent: review.agent_name ?? run.agent_name,
    review,
    ...(args.warning ? { warning: args.warning } : {}),
  });
}
