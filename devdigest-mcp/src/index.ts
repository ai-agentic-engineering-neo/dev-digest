// Ring 4 composition root: config -> adapter -> health gate -> McpServer -> stdio.
// stdout is reserved for JSON-RPC; everything else goes to stderr via log.ts.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DevDigestClient } from './adapters/devdigest-client.js';
import { apiErrorMessage } from './domain/errors.js';
import { ApiError } from './domain/ports.js';
import { parseConfig } from './config.js';
import { log } from './log.js';
import { createMcpServer } from './server.js';
import { withHealthGate } from './services/health-gate.js';

async function main(): Promise<void> {
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    log.error(parsed.message);
    process.exit(1);
  }
  const { config } = parsed;

  const client = new DevDigestClient({ baseUrl: config.apiBaseUrl, httpTimeoutMs: config.httpTimeoutMs });
  const server = createMcpServer({ api: withHealthGate(client), baseUrl: config.apiBaseUrl });

  await server.connect(new StdioServerTransport());
  log.info(`ready; API ${config.apiBaseUrl}`);

  // Warn only: the API may be started after the MCP server. Tools re-check lazily.
  client.health().catch((err: unknown) => {
    const text =
      err instanceof ApiError
        ? apiErrorMessage(err, { baseUrl: config.apiBaseUrl, tool: 'startup' })
        : 'DevDigest API health check failed.';
    log.warn(text);
  });
}

main().catch((err: unknown) => {
  log.error(`fatal: ${err instanceof Error ? err.name : 'unknown error'}`);
  process.exit(1);
});
