import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiReview, ApiRun, DevDigestApi } from '../api-client.js';
import type { Config } from '../config.js';
import { ToolError } from '../errors.js';
import { doneResult, findingsText, type FindingsResult } from '../format.js';

export interface ToolDeps {
  api: DevDigestApi;
  config: Config;
}

/** Same three argument names in every tool: repo, pr_id, agent_id (+ run_id in get_findings). */
export const repoArg = z
  .string()
  .min(1)
  .describe('Repository: "owner/name", a bare "name" if unique, or the repo UUID');

export const optionalRepoArg = repoArg
  .optional()
  .describe('Repository: "owner/name", a bare "name" if unique, or the repo UUID. Optional: without it the PR is looked up in every imported repository');

export const prIdArg = z
  .union([z.number().int().positive(), z.string().min(1)])
  .describe('Pull request: number (15, "15" or "#15"), PR UUID, or part of its title (must match exactly one PR)');

export const agentIdArg = z
  .string()
  .min(1)
  .describe('agent_id from list_agents; the exact agent name (case-insensitive) also works');

export function ok<T extends Record<string, unknown>>(data: T, text: string): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: data };
}

export function findingsOk(r: FindingsResult): CallToolResult {
  return ok(r, findingsText(r));
}

/** A failed / cancelled run → an actionable error (shared by run_agent_on_pr and get_findings with run_id). */
export function assertRunSucceeded(run: ApiRun): void {
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
}

/** The stored review of a finished run, or an actionable error if it is not persisted yet. */
export function reviewOfRun(reviews: ApiReview[], run: ApiRun): ApiReview {
  const review = reviews.find((r) => r.run_id === run.run_id && r.kind === 'review');
  if (!review) {
    throw new ToolError(
      `Run ${run.run_id} finished but its review is not stored yet. Call get_findings with this run_id again.`,
    );
  }
  return review;
}

/** A finished run → its review's findings; failed/cancelled → actionable error. */
export async function finishedRunResult(
  deps: ToolDeps,
  args: { run: ApiRun; prId: string; prNumber: number; repo: string; warning?: string },
  signal?: AbortSignal,
): Promise<FindingsResult> {
  assertRunSucceeded(args.run);
  const review = reviewOfRun(await deps.api.listReviews(args.prId, signal), args.run);
  return doneResult({
    repo: args.repo,
    prNumber: args.prNumber,
    prId: args.prId,
    run: args.run,
    review,
    ...(args.warning ? { warning: args.warning } : {}),
  });
}
