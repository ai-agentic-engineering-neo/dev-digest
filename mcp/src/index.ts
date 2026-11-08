#!/usr/bin/env node
/**
 * DevDigest MCP server — stdio entry point.
 * stdout is reserved for JSON-RPC: log ONLY via console.error (stderr).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  console.error(`[devdigest-mcp] ready (stdio) → ${config.apiUrl}`);
}

main().catch((err) => {
  console.error('[devdigest-mcp] fatal:', err);
  process.exit(1);
});
