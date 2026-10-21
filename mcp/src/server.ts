import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api/client.js';
import type { McpConfig } from './config.js';
import { defaultSleep } from './wait.js';
import * as listAgents from './tools/list-agents.js';
import * as runAgentOnPr from './tools/run-agent-on-pr.js';
import * as getFindings from './tools/get-findings.js';
import * as getConventions from './tools/get-conventions.js';
import * as getBlastRadius from './tools/get-blast-radius.js';
import type { ToolDeps } from './tools/types.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.0.0';

export const INSTRUCTIONS =
  'DevDigest tools review pull requests that are already imported into the local DevDigest app (API on localhost:3001). ' +
  'Use them to list reviewer agents, run one agent on a PR and get its grounded findings, read the verdict of a finished run, read a PR\'s blast radius (changed symbols, callers, endpoints), and read a repository\'s accepted coding conventions. ' +
  'Identify PRs by repo name and PR number; get agent ids from devdigest_list_agents. ' +
  'Only devdigest_run_agent_on_pr starts work and costs money.';

export interface CreateServerOptions {
  api: ApiClient;
  config: McpConfig;
  sleep?: ToolDeps['sleep'];
  now?: ToolDeps['now'];
}

/** Registers the five tools in a fixed order (deterministic tools/list). */
export function createServer(opts: CreateServerOptions): McpServer {
  const deps: ToolDeps = {
    api: opts.api,
    config: opts.config,
    sleep: opts.sleep ?? defaultSleep,
    now: opts.now ?? Date.now,
  };
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  listAgents.register(server, deps);
  runAgentOnPr.register(server, deps);
  getFindings.register(server, deps);
  getConventions.register(server, deps);
  getBlastRadius.register(server, deps);
  return server;
}
