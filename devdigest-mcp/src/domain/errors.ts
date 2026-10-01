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
