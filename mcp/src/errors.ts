import { ApiError } from './api/client.js';

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** An error whose message is safe and useful to show the model as-is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function toToolError(err: unknown): ToolResult {
  let text: string;
  if (err instanceof UserError || err instanceof ApiError) {
    text = err.message;
  } else if (err instanceof Error && err.name === 'AbortError') {
    text = 'The call was cancelled.';
  } else {
    text = `Unexpected error: ${err instanceof Error ? err.message : 'unknown'}. Check the MCP server stderr log.`;
  }
  return { isError: true, content: [{ type: 'text', text }] };
}

export function toToolResult(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
