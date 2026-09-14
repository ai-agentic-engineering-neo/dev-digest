#!/usr/bin/env node
import { loadConfig } from './config.js';
import { DevDigestHttpClient } from './http/client.js';
import { runCli } from './cli/run.js';
import { RealGitRunner } from './cli/git.js';

/**
 * `devdigest review --mode working` — specs/08-pre-push-cli.md. Entry point:
 * build a real `Config` + `DevDigestHttpClient` + `RealGitRunner`, call
 * `runCli(argv, deps)`, exit with the code it returns. Thin — tests bypass
 * this file entirely and call `runCli` directly with fakes.
 *
 * Invocation: `pnpm --dir mcp-server exec tsx src/cli.ts review --mode working
 * --agent <id>` (the same cwd-independent form `.mcp.json` uses), or the
 * `"review"` package.json script. This file adds NO MCP tool and does not
 * touch `src/tools/` — the CLI and the MCP server are two independent entry
 * points into the same `src/http/*` client.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const http = new DevDigestHttpClient({ baseUrl: config.apiBaseUrl });
  const git = new RealGitRunner();

  // Drop the leading "review" subcommand token, if present, so `runCli`
  // (and its tests) deal only in flags — there is only ever one subcommand.
  const rawArgs = process.argv.slice(2);
  const argv = rawArgs[0] === 'review' ? rawArgs.slice(1) : rawArgs;

  const code = await runCli(argv, {
    git,
    http,
    apiBaseUrl: config.apiBaseUrl,
    cwd: process.cwd(),
    stdout: (text) => {
      process.stdout.write(`${text}\n`);
    },
    stderr: (text) => {
      process.stderr.write(`${text}\n`);
    },
  });

  process.exit(code);
}

main().catch((err: unknown) => {
  console.error('devdigest review: unexpected failure:', err);
  process.exit(4);
});
