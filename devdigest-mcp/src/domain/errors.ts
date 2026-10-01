// Ring 1. Pure builders for the text the model sees. Each message says what
// happened and what to call/do next. Nothing from the server except a short,
// truncated 409 message is ever interpolated; details and stacks never are.
import type { ApiError } from './ports.js';

export interface ErrorContext {
  /** Configured API base URL (from env, not from tool args). */
  baseUrl: string;
  /** Name of the calling tool, used in the rate-limit hint. */
  tool: string;
  /** Contextual text for a 404 (repo / PR / agent / run), supplied by the service. */
  notFound?: string;
}

const MAX_SERVER_MESSAGE = 200;

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

export function apiErrorMessage(err: ApiError, ctx: ErrorContext): string {
  switch (err.kind) {
    case 'unreachable':
      return `DevDigest API is not reachable at ${ctx.baseUrl}. Start it with ./scripts/dev.sh (API listens on 127.0.0.1:3001) or fix DEVDIGEST_API_URL in .mcp.json, then call this tool again.`;
    case 'not_api':
      return `${ctx.baseUrl} answered with HTML, not the DevDigest API — it looks like the web UI (Next.js, port 3000). Set DEVDIGEST_API_URL to the API (default http://127.0.0.1:3001) and reconnect the server via /mcp.`;
    case 'invalid_input':
      return `DevDigest rejected the request as invalid (${err.code ?? `HTTP ${err.status ?? 400}`}). Check the arguments: repo as "owner/name", pr as a positive integer, agent and run_id as ids returned by list_agents / run_agent_on_pr.`;
    case 'not_found':
      return (
        ctx.notFound ??
        `DevDigest could not find the requested resource (${err.endpoint}). Check the arguments against list_agents / the DevDigest UI, then call this tool again.`
      );
    case 'conflict': {
      const detail = clip(err.serverMessage ?? 'conflicting state', MAX_SERVER_MESSAGE);
      return `DevDigest reported a conflict: ${detail}. Wait a few seconds and call the tool again.`;
    }
    case 'rate_limited':
      return `DevDigest rate limit reached (starting reviews is limited to 10 per minute). Wait about a minute before calling ${ctx.tool} again — do not retry in a loop.`;
    case 'server':
      return `The DevDigest API failed with an internal error (HTTP ${err.status ?? 500}). Check the API terminal; if it shows "relation … does not exist", run "cd server && pnpm db:migrate", then retry.`;
    case 'contract':
      return `DevDigest returned an unexpected response from ${err.endpoint}. The MCP server and the API are probably on different commits — update both, then retry.`;
  }
}

/**
 * A failure whose message is already model-safe (built by the helpers below).
 * Services throw it; tools/result.ts renders it as isError:true verbatim.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export function repoNotFoundMessage(repo: string): string {
  return `No repo matching "${repo}" was found. Check the "owner/name" spelling; this tool does not add new repos, only the DevDigest UI/API does.`;
}

export function prNotFoundMessage(repo: string, pr: number): string {
  return `PR #${pr} was not found in repo "${repo}". Check the PR number, or that the repo has been polled recently enough to have indexed it.`;
}

export function agentNotFoundMessage(agent: string): string {
  return `Agent "${agent}" was not found (or is disabled) in this workspace. Call list_agents to get a valid, enabled agent id.`;
}

export function runNotFoundMessage(runId: string, repo: string, pr: number): string {
  return `No review found for run_id "${runId}" on PR #${pr} in "${repo}". Check the run_id against the one run_agent_on_pr returned.`;
}

export function runInProgressMessage(runId: string): string {
  return `Run "${runId}" is still in progress and has no findings yet. Wait and call get_findings again.`;
}

export function runFailedMessage(runId: string, error: string | null | undefined): string {
  const detail = error ? clip(error, 300) : 'no error detail was recorded';
  return `Run "${runId}" failed: ${detail}. Call list_agents to confirm the agent is still valid, or try run_agent_on_pr again.`;
}

export function runCancelledMessage(runId: string): string {
  return `Run "${runId}" was cancelled before it produced findings. Call run_agent_on_pr again to start a new run.`;
}

export function runDoneWithoutReviewMessage(runId: string, repo: string, pr: number): string {
  return `Run "${runId}" finished but no review was persisted for it. Call get_findings(repo="${repo}", pr=${pr}, run_id="${runId}") in a moment; if it is still missing, call run_agent_on_pr again.`;
}

function formatDuration(ms: number): string {
  if (ms % 60_000 === 0) {
    const m = ms / 60_000;
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${Math.round(ms / 1000)} seconds`;
}

/** The run keeps going on the server (never cancelled); tell the model how to fetch it later. */
export function runLeftRunningMessage(
  runId: string,
  repo: string,
  pr: number,
  why: { kind: 'timeout'; ms: number } | { kind: 'dropped' } | { kind: 'client_abort' },
): string {
  const lead =
    why.kind === 'timeout'
      ? `Run "${runId}" is still running after ${formatDuration(why.ms)} and was left running (not cancelled).`
      : why.kind === 'dropped'
        ? `Lost contact with run "${runId}" before it finished (the API connection dropped); it may still be running and was not cancelled.`
        : `This call was aborted while run "${runId}" was in progress; the run was left running (not cancelled).`;
  return `${lead} Call get_findings(repo="${repo}", pr=${pr}, run_id="${runId}") again later to fetch the result.`;
}

export function runStartTimeoutMessage(repo: string, pr: number): string {
  return `Timed out before the agent run on PR #${pr} in "${repo}" could start; no run was created. Call run_agent_on_pr again.`;
}
