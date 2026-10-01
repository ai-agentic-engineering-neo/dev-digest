// Ring 4. Maps service outcomes to MCP tool results. Success is compact JSON in
// a text block; every failure is isError:true with a message from
// domain/errors.ts. The last-resort catch never exposes a stack or raw message.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { apiErrorMessage, type ErrorContext } from '../domain/errors.js';
import { ApiError } from '../domain/ports.js';
import { log } from '../log.js';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Runs `fn`, returning `ok(data)` or a `fail(...)`; never throws. */
export async function toolResult(ctx: ErrorContext, fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof ApiError) return fail(apiErrorMessage(err, ctx));
    // Unknown failure: log only the error class to stderr, keep the model's text generic.
    log.error(`${ctx.tool}: unexpected ${err instanceof Error ? err.name : typeof err}`);
    return fail(
      `${ctx.tool} failed unexpectedly inside the DevDigest MCP server. Check the MCP server's stderr output, then call this tool again.`,
    );
  }
}
