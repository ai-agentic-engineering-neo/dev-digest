/**
 * specs/08-pre-push-cli.md §Exit codes — the whole exit-code contract for
 * `devdigest review`, in one place so nothing downstream invents its own code.
 *
 *   0  Review ran; no blocking findings. Also: empty diff, and --help.
 *   1  Review ran; >=1 blocking finding (blockers > 0, gate = agent.ci_fail_on).
 *   2  Usage error — unknown flag, unknown/unimplemented --mode, missing
 *      --agent, agent not found or ambiguous.
 *   3  Environment error — not a git repo, git not on PATH, diff exceeds the
 *      size cap.
 *   4  Review failed to run — backend unreachable, timeout, 4xx/5xx from the
 *      API, provider key missing, nothing reviewable in the diff.
 */
export const EXIT = {
  OK: 0,
  BLOCKING: 1,
  USAGE: 2,
  ENVIRONMENT: 3,
  REVIEW_FAILED: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * Thrown anywhere in the CLI flow to short-circuit straight to a specific
 * exit code with a forward-leading message (never a bare error) — mirrors
 * this repo's "never a bare error" bar (specs/06-mcp-server.md §Error
 * handling). `runCli` (`src/cli/run.ts`) is the one place that catches this
 * and decides the process exit code — see that file's docstring.
 */
export class CliError extends Error {
  constructor(
    public readonly code: ExitCode,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
