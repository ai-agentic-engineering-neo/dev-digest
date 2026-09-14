import { spawn } from 'node:child_process';
import { CliError, EXIT } from './exit.js';

/** One `git <args>` invocation's result — never throws on a non-zero exit;
 *  callers decide what a given exit code means for the args they ran. */
export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * The injectable seam for every git invocation this package makes — same
 * shape as `DevDigestHttpClient` being the only `fetch()` caller
 * (`mcp-server/CLAUDE.md:20-23`). Every layer above (`diff-source.ts`,
 * `run.ts`) takes a `GitRunner` as an argument and is tested against a
 * hand-written fake, never a real process.
 */
export interface GitRunner {
  run(args: string[], cwd: string): Promise<GitResult>;
}

/**
 * The ONLY module in this package allowed to spawn a child process — same
 * rule shape as `src/http/client.ts` being the only `fetch()` caller.
 * Uses `spawn` with an argument array (never a shell string), so untrusted
 * input (e.g. a path containing spaces or shell metacharacters) can never be
 * reinterpreted by a shell.
 */
export class RealGitRunner implements GitRunner {
  run(args: string[], cwd: string): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      // Spawn-level failure (e.g. ENOENT — `git` not on PATH) — rejects
      // rather than resolving with a fake exit code, so callers can tell
      // "git ran and failed" from "git could not even be started".
      child.on('error', (err) => reject(err));
      child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    });
  }
}

const NOT_A_GIT_REPO_MESSAGE =
  "Not a git repository (or any parent up to the filesystem root). Run this from inside your repo's working copy.";
const GIT_NOT_ON_PATH_MESSAGE =
  '`git` was not found on your PATH. Install git, or run this from a shell where `git --version` works.';

function isGitNotFound(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * `git rev-parse --show-toplevel` from `cwd` — the repo root every other git
 * call in this package runs from. Error handling table rows: "Not a git
 * repository" and "`git` not on PATH", both exit `EXIT.ENVIRONMENT`.
 */
export async function findRepoRoot(cwd: string, git: GitRunner): Promise<string> {
  let result: GitResult;
  try {
    result = await git.run(['rev-parse', '--show-toplevel'], cwd);
  } catch (err) {
    if (isGitNotFound(err)) {
      throw new CliError(EXIT.ENVIRONMENT, GIT_NOT_ON_PATH_MESSAGE);
    }
    throw err;
  }
  if (result.exitCode !== 0) {
    throw new CliError(EXIT.ENVIRONMENT, NOT_A_GIT_REPO_MESSAGE);
  }
  return result.stdout.trim();
}
