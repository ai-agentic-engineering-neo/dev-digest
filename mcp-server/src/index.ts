#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DevDigestHttpClient } from './http/client.js';
import { registerTools } from './tools/index.js';

/**
 * Entry point: build the McpServer, register the 5 tools (fixed order — see
 * `tools/index.ts`), connect a `StdioServerTransport`. Launched on demand by
 * Claude Code via the project-scoped `.mcp.json` at the repo root — never by
 * `./scripts/dev.sh`.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const http = new DevDigestHttpClient({ baseUrl: config.apiBaseUrl });

  const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
  registerTools(server, http, config.apiBaseUrl);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error('devdigest mcp-server failed to start:', err);
  process.exit(1);
});
