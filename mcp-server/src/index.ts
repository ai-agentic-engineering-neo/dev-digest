import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FetchApiClient } from './client.js';
import { registerAllTools } from './tools/index.js';

// Stdio hygiene: the MCP protocol owns stdout. Nothing else may write to it —
// a stray console.log would corrupt the JSON-RPC stream. Diagnostics go to
// stderr only.
console.log = (...args: unknown[]) => console.error(...args);

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

const server = new McpServer({ name: 'devdigest', version: '0.0.0' });
const client = new FetchApiClient(baseUrl);
registerAllTools(server, client);

await server.connect(new StdioServerTransport());
