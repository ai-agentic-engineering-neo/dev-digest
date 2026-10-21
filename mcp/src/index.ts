import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './api/client.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

// stdout is the MCP protocol channel: log to stderr only.
async function main(): Promise<void> {
  const config = loadConfig();
  const api = createApiClient({ baseUrl: config.apiUrl, fetch: globalThis.fetch });
  const server = createServer({ api, config });
  await server.connect(new StdioServerTransport());
  console.error(`devdigest-mcp ready (API ${config.apiUrl})`);
}

main().catch((err) => {
  console.error('devdigest-mcp failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
