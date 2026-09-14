import { CliError, EXIT } from './exit.js';
import type { GitRunner } from './git.js';

/**
 * The mode seam (specs/08-pre-push-cli.md §"The --mode seam"). All three are
 * valid FLAG values — `staged`/`branch` are real modes with their own
 * explanatory "not implemented yet" message, never treated as an unknown
 * flag value. Adding `staged` later is a one-case edit here plus one
 * `--help` line; no other module knows what a mode is.
 */
export type ReviewMode = 'working' | 'staged' | 'branch';
export const REVIEW_MODES: readonly ReviewMode[] = ['working', 'staged', 'branch'];

export interface DiffSourceContext {
  repoRoot: string;
  git: GitRunner;
}

/**
 * Resolve the raw diff text for `mode`. `working` is the only implemented
 * case; `staged`/`branch` throw their own `CliError(EXIT.USAGE, …)` with the
 * spec's verbatim messages — never a silent no-op, never a generic "unknown
 * mode" message (that's reserved for a flag value outside `REVIEW_MODES`
 * entirely, checked by the caller before this function is reached).
 */
export async function resolveDiff(mode: ReviewMode, ctx: DiffSourceContext): Promise<string> {
  switch (mode) {
    case 'working': {
      // Covers staged AND unstaged changes to tracked files — untracked
      // files are handled (warned about) by the caller, not here.
      const result = await ctx.git.run(['diff', 'HEAD'], ctx.repoRoot);
      if (result.exitCode !== 0) {
        throw new CliError(
          EXIT.ENVIRONMENT,
          `\`git diff HEAD\` failed: ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
        );
      }
      return result.stdout;
    }
    case 'staged':
      throw new CliError(
        EXIT.USAGE,
        '--mode staged is not implemented yet (planned: git diff --cached). Use --mode working, which already includes your staged changes.',
      );
    case 'branch':
      throw new CliError(
        EXIT.USAGE,
        '--mode branch is not implemented yet (planned: git diff <merge-base>...HEAD). Use --mode working for uncommitted changes, or open a PR and review it in the web UI.',
      );
  }
}
