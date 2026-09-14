import { CliError, EXIT } from './exit.js';

/**
 * Hand-rolled parser (specs/08-pre-push-cli.md Decision "Arg parsing" — no
 * parsing library; the package's only deps are `zod` + the MCP SDK, and the
 * surface is one command with three flags).
 *
 * Deliberately does NOT reject a missing `--mode`/`--agent` or an unknown
 * `--mode` value here — those need context this pure parser doesn't have
 * (the real agent list for `--agent`, `REVIEW_MODES` for `--mode`), so
 * `run.ts` validates them after parsing. This file only knows the flag
 * SYNTAX, not the domain values.
 */
export interface ParsedArgs {
  help: boolean;
  mode?: string;
  agent?: string;
}

const KNOWN_FLAGS = new Set(['--mode', '--agent', '--help', '-h']);

/** Supports `--flag value` and `--flag=value`, in any order, mixed. */
export function parseArgs(argv: string[]): ParsedArgs {
  let help = false;
  let mode: string | undefined;
  let agent: string | undefined;

  let i = 0;
  while (i < argv.length) {
    const raw = argv[i]!;

    if (raw === '-h' || raw === '--help') {
      help = true;
      i += 1;
      continue;
    }

    const eqIndex = raw.indexOf('=');
    const flag = eqIndex >= 0 ? raw.slice(0, eqIndex) : raw;
    if (!KNOWN_FLAGS.has(flag)) {
      throw new CliError(EXIT.USAGE, `Unknown flag '${raw}'. Run with --help to see the valid flags.`);
    }

    let value: string;
    if (eqIndex >= 0) {
      value = raw.slice(eqIndex + 1);
      i += 1;
    } else {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new CliError(EXIT.USAGE, `Flag '${flag}' requires a value. Run with --help to see usage.`);
      }
      value = next;
      i += 2;
    }

    if (flag === '--mode') mode = value;
    else if (flag === '--agent') agent = value;
  }

  return { help, ...(mode !== undefined ? { mode } : {}), ...(agent !== undefined ? { agent } : {}) };
}

/** VERBATIM — specs/08-pre-push-cli.md §"--help text (verbatim)". Do not
 *  paraphrase, shorten, or "improve"; the exit-code table and untracked-files
 *  paragraph here are load-bearing for the spec's manual verification pass. */
export const HELP_TEXT = `devdigest review — review your local changes before you push.

USAGE
  devdigest review --mode working --agent <id|name>

FLAGS
  --mode <mode>     Which changes to review. Required.
                      working  Uncommitted changes in the working tree
                               (staged AND unstaged, tracked files only).
                      staged   Not yet implemented.
                      branch   Not yet implemented.
  --agent <id|name> Which review agent to run. Required — an agent supplies the
                    system prompt, model and blocking gate, so there is no
                    default. Run with --agent omitted to see the available ones.
  -h, --help        Show this help.

WHAT IS REVIEWED
  --mode working collects \`git diff HEAD\`: every staged and unstaged change to a
  tracked file. UNTRACKED FILES ARE NOT REVIEWED — \`git diff HEAD\` does not see
  them. \`git add\` them first to include them. Binary files, pure renames and
  deletions carry no reviewable lines and are skipped.

  Findings go to stdout; progress and warnings go to stderr.

EXIT CODES
  0  Review ran, no blocking findings (also: nothing to review).
  1  Review ran, at least one BLOCKING finding. "Blocking" is the agent's own
     ci_fail_on gate — the same gate the PR review and CI use.
  2  Usage error (bad or missing flag, unknown agent).
  3  Environment error (not a git repository, git not found, diff too large).
  4  The review could not run (API unreachable, timed out, or returned an error).

ENVIRONMENT
  DEVDIGEST_API_BASE_URL  Dev Digest API base URL. Default http://localhost:3001.
`;
