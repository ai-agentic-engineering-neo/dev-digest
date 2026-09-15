import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './client.js';

/**
 * Captures a tool's handler without spinning up a real McpServer/transport —
 * `register*Tool` only ever calls `registerTool` once, so a minimal fake
 * covering just that method is enough.
 */
export function captureHandler<Args>(
  register: (server: McpServer, client: ApiClient) => void,
  client: ApiClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (args: Args) => Promise<any> {
  let captured: ((args: Args) => Promise<unknown>) | undefined;
  const fakeServer = {
    registerTool: (_name: string, _config: unknown, cb: (args: Args) => Promise<unknown>) => {
      captured = cb;
    },
  } as unknown as McpServer;
  register(fakeServer, client);
  if (!captured) throw new Error('register function did not call registerTool');
  return captured;
}

interface StubClientOverrides {
  get?: (path: string) => Promise<unknown>;
  post?: (path: string, body?: unknown) => Promise<unknown>;
}

export function stubClient(overrides: StubClientOverrides): ApiClient {
  return {
    get: overrides.get ?? (async () => { throw new Error('get not stubbed'); }),
    post: overrides.post ?? (async () => { throw new Error('post not stubbed'); }),
  } as ApiClient;
}
