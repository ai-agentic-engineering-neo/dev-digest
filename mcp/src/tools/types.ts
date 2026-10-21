import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import type { ApiClient } from '../api/client.js';
import type { McpConfig } from '../config.js';

export interface ToolDeps {
  api: ApiClient;
  config: McpConfig;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
}

/** The slice of the SDK's request-handler `extra` that tools use. */
export interface ToolExtra {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: ServerNotification) => Promise<void>;
}
