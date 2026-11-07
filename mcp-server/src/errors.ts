import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, ApiShapeError, ApiUnreachableError } from './api-client.js';

/** A domain failure whose message already tells the model what to do next. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Tool-execution error (isError: true) — visible to the model so it can self-correct. */
export function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function nextStep(status: number): string {
  if (status === 404) return 'Check the agent (list_agents), repo and PR number, then retry.';
  if (status === 400 || status === 422) return 'Check the tool arguments, then retry.';
  if (status >= 500) return 'Check the DevDigest API log, then retry.';
  return 'Retry; if it keeps failing, check the DevDigest API log.';
}

/** Any thrown error → an actionable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ToolError) return err.message;
  if (err instanceof ApiUnreachableError) {
    return (
      `DevDigest API is unreachable at ${err.baseUrl}. Start the DevDigest API server, ` +
      `or set DEVDIGEST_API_URL to where it runs, then retry.`
    );
  }
  if (err instanceof ApiShapeError) {
    return (
      `${err.message}. The MCP server and the DevDigest API are probably out of sync: run both from the same ` +
      `commit (pull, then restart the API and the MCP server), then retry. If it persists, report it with this message.`
    );
  }
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const wait = err.retryAfterSec ? `${err.retryAfterSec} s` : 'a minute';
      return `DevDigest rate limit reached (10 reviews/min). Retry in ${wait}.`;
    }
    return `DevDigest API error ${err.status} ${err.code}: ${err.message}. ${nextStep(err.status)}`;
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}

/** Wrap a tool handler: domain/API errors become isError results; stack goes to stderr only. */
export function guarded<A extends unknown[]>(
  name: string,
  fn: (...args: A) => Promise<CallToolResult>,
): (...args: A) => Promise<CallToolResult> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      // The handler's extra (last arg) carries the client's abort signal.
      const extra: unknown = args[args.length - 1];
      const signal =
        typeof extra === 'object' && extra !== null && 'signal' in extra ? (extra as { signal?: AbortSignal }).signal : undefined;
      if (signal?.aborted) {
        console.error(`[devdigest-mcp] ${name}: cancelled by client`);
        return toolError('Cancelled by the client.');
      }
      // stderr only (stdout is JSON-RPC); full stack just for unexpected errors
      if (err instanceof ApiError || err instanceof ApiUnreachableError || err instanceof ApiShapeError) {
        console.error(`[devdigest-mcp] ${name}: ${err.message}`);
      } else if (!(err instanceof ToolError)) {
        console.error(`[devdigest-mcp] ${name} failed:`, err);
      }
      return toolError(errorMessage(err));
    }
  };
}
