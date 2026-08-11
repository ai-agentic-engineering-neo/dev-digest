import type { DevDigestHttpClient } from '../http/client.js';
import { DevDigestApiError, commonErrorMessage, isRateLimited } from '../http/errors.js';
import { CliError, EXIT } from './exit.js';
import { parseArgs, HELP_TEXT } from './args.js';
import { findRepoRoot, type GitRunner } from './git.js';
import { resolveDiff, REVIEW_MODES, type ReviewMode } from './diff-source.js';
import { renderReview, type RenderSeverity } from './render.js';

/** Matches the route's own `bodyLimit` (`server/src/modules/reviews/routes.ts`
 *  — `POST /reviews/adhoc`'s 5 MB override of the app-wide 1 MB cap). Checked
 *  client-side BEFORE any HTTP call, so an oversized diff never round-trips
 *  to the server just to be rejected. */
export const MAX_DIFF_BYTES = 5 * 1024 * 1024;

/** The HTTP client's `DEFAULT_TIMEOUT_MS` (15s, `http/client.ts:13`) is far
 *  too short for an LLM call — this route can genuinely take a couple of
 *  minutes for a large diff. */
export const ADHOC_REVIEW_TIMEOUT_MS = 180_000;

/** Subset of `@devdigest/shared`'s `Agent` contract this CLI reads — no
 *  `@devdigest/shared` alias in this package (`mcp-server/CLAUDE.md:16-19`). */
interface RawAgent {
  id: string;
  name: string;
  model: string;
}

/** Subset of `@devdigest/shared`'s `Finding` contract. */
interface RawFinding {
  severity: RenderSeverity;
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  rationale: string;
  suggestion?: string | null;
}

/** `POST /reviews/adhoc`'s response envelope (server/src/modules/reviews/routes.ts). */
interface RawAdhocReviewResponse {
  agent: { id: string; name: string; model: string; ci_fail_on: string };
  verdict: string;
  summary: string;
  score: number;
  findings: RawFinding[];
  grounding: string;
  blockers: number;
  files_reviewed: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
}

export interface RunCliDeps {
  git: GitRunner;
  http: DevDigestHttpClient;
  apiBaseUrl: string;
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * `runCli` — the whole `devdigest review` flow, fully injectable (git, http,
 * stdout, stderr, cwd — specs/08-pre-push-cli.md §Approach "the CLI"). The
 * ONE place the exit code is decided; `src/cli.ts` is a thin wrapper that
 * builds real deps and calls `process.exit(await runCli(...))`.
 */
export async function runCli(argv: string[], deps: RunCliDeps): Promise<number> {
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      deps.stdout(HELP_TEXT);
      return EXIT.OK;
    }

    if (parsed.mode === undefined) {
      throw new CliError(
        EXIT.USAGE,
        '--mode is required. Valid modes: working, staged (not yet implemented), branch (not yet implemented). Run with --help to see usage.',
      );
    }
    if (!REVIEW_MODES.includes(parsed.mode as ReviewMode)) {
      throw new CliError(
        EXIT.USAGE,
        `Unknown mode '${parsed.mode}'. Valid modes: working, staged (not yet implemented), branch (not yet implemented).`,
      );
    }
    const mode = parsed.mode as ReviewMode;

    if (parsed.agent === undefined) {
      throw new CliError(EXIT.USAGE, await missingAgentMessage(deps.http));
    }
    const agentInput = parsed.agent;

    // ---- Step 2: locate the repo -----------------------------------------
    const repoRoot = await findRepoRoot(deps.cwd, deps.git);

    // ---- Step 3: resolve the diff (throws EXIT.USAGE for staged/branch) --
    const diff = await resolveDiff(mode, { repoRoot, git: deps.git });

    // ---- Step 4: nothing changed -> exit 0, no HTTP call ------------------
    if (diff.trim().length === 0) {
      deps.stdout('No tracked changes to review. (Untracked files are not included — `git add` them first.)');
      return EXIT.OK;
    }

    // ---- Step 5: untracked-files warning (stderr; review still proceeds) -
    await warnUntrackedFiles(deps, repoRoot);

    // ---- Step 6: size cap, BEFORE any HTTP call ---------------------------
    const byteLength = Buffer.byteLength(diff, 'utf8');
    if (byteLength > MAX_DIFF_BYTES) {
      const mb = (byteLength / (1024 * 1024)).toFixed(1);
      throw new CliError(
        EXIT.ENVIRONMENT,
        `Your working-tree diff is ${mb} MB, over the 5 MB limit. Commit or stash part of the change and review it in smaller pieces.`,
      );
    }

    // ---- Step 7: resolve the agent (id first, then case-insensitive name) -
    const agent = await resolveAgent(deps.http, deps.apiBaseUrl, agentInput);

    // ---- Step 8: run the review (long-running; progress on stderr) -------
    deps.stderr('Running review — this can take a while for a large diff...');
    let response: RawAdhocReviewResponse;
    try {
      response = await deps.http.post<RawAdhocReviewResponse>(
        '/reviews/adhoc',
        { agent_id: agent.id, diff },
        ADHOC_REVIEW_TIMEOUT_MS,
      );
    } catch (err) {
      throw mapReviewError(err, deps.apiBaseUrl);
    }

    // ---- Step 9: render to stdout ------------------------------------------
    const text = renderReview({
      mode,
      filesReviewed: response.files_reviewed,
      agentName: response.agent.name,
      findings: response.findings,
      blockers: response.blockers,
      ciFailOn: response.agent.ci_fail_on,
      grounding: response.grounding,
    });
    deps.stdout(text);

    // ---- Step 10: the exit-code decision -----------------------------------
    if (response.blockers > 0) {
      deps.stderr(`Blocking findings present — exiting ${EXIT.BLOCKING}.`);
      return EXIT.BLOCKING;
    }
    deps.stderr(`No blocking findings — exiting ${EXIT.OK}.`);
    return EXIT.OK;
  } catch (err) {
    if (err instanceof CliError) {
      deps.stderr(err.message);
      return err.code;
    }
    deps.stderr(commonErrorMessage(err, deps.apiBaseUrl));
    return EXIT.REVIEW_FAILED;
  }
}

/** Error handling table's "--agent missing" row: tries `GET /agents` for a
 *  helpful list; falls back to plain usage text if the backend is unreachable. */
async function missingAgentMessage(http: DevDigestHttpClient): Promise<string> {
  const base = '--agent is required — an agent supplies the system prompt, model and blocking gate.';
  try {
    const agents = await http.get<RawAgent[]>('/agents');
    if (agents.length === 0) {
      return `${base} No agents exist in this workspace yet — create one in the web UI (Agents → New).`;
    }
    return `${base} Available agents: ${formatAgentList(agents)}`;
  } catch {
    return `${base} Run with --help to see usage.`;
  }
}

/** `(id|name)` -> the matching agent. `id` matches first, then a
 *  case-insensitive exact `name` match — same "id first" shape
 *  `resolvers/repo.ts`'s `owner/name` vs bare-name lookup uses. */
async function resolveAgent(http: DevDigestHttpClient, apiBaseUrl: string, input: string): Promise<RawAgent> {
  const agents = await fetchAgentsOrThrow(http, apiBaseUrl);

  const byId = agents.find((a) => a.id === input);
  if (byId) return byId;

  const needle = input.trim().toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === needle);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new CliError(EXIT.USAGE, `'${input}' matches multiple agents: ${formatAgentList(byName)}. Retry with the agent id.`);
  }
  throw new CliError(EXIT.USAGE, `Agent '${input}' not found. Available agents: ${formatAgentList(agents)}.`);
}

/** Network/5xx failure fetching `/agents` for RESOLUTION (as opposed to the
 *  "--agent omitted" listing above) is a review-could-not-run failure
 *  (EXIT.REVIEW_FAILED), not a usage error — the flag itself was fine. */
async function fetchAgentsOrThrow(http: DevDigestHttpClient, apiBaseUrl: string): Promise<RawAgent[]> {
  try {
    return await http.get<RawAgent[]>('/agents');
  } catch (err) {
    throw new CliError(EXIT.REVIEW_FAILED, commonErrorMessage(err, apiBaseUrl));
  }
}

function formatAgentList(agents: RawAgent[]): string {
  return agents.map((a) => `${a.id} — ${a.name} (${a.model})`).join(', ');
}

/**
 * `git ls-files --others --exclude-standard` — untracked files `git diff
 * HEAD` never sees. Best-effort: a failure here never fails the review
 * itself, it just skips the warning.
 */
async function warnUntrackedFiles(deps: RunCliDeps, repoRoot: string): Promise<void> {
  let result;
  try {
    result = await deps.git.run(['ls-files', '--others', '--exclude-standard'], repoRoot);
  } catch {
    return;
  }
  if (result.exitCode !== 0) return;
  const paths = result.stdout
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paths.length === 0) return;

  const shown = paths.slice(0, 3);
  const more = paths.length > shown.length ? ', …' : '';
  deps.stderr(
    `Note: ${paths.length} untracked file(s) not reviewed (git diff HEAD only covers tracked files): ` +
      `${shown.join(', ')}${more}. Run 'git add' on them first to include them.`,
  );
}

/** Error handling table's `POST /reviews/adhoc` rows. Rate-limit detection is
 *  HTTP-status-based ONLY (never `error.code` — see `http/errors.ts`'s
 *  `isRateLimited` and `mcp-server/LEARNINGS.md`'s 429-mislabeling entry);
 *  "nothing reviewable" / "provider key missing" are detected by the API's
 *  stable error `code`, since the SAME mislabeling risk applies to status —
 *  `ConfigError` actually responds 500, not the 4xx the spec's prose
 *  describes, so branching on status here would silently miss it. */
function mapReviewError(err: unknown, apiBaseUrl: string): CliError {
  if (isRateLimited(err)) {
    return new CliError(
      EXIT.REVIEW_FAILED,
      'Rate limited: more than 10 reviews were requested in the last minute. Wait a bit and retry.',
    );
  }
  if (err instanceof DevDigestApiError && err.code === 'nothing_reviewable') {
    return new CliError(
      EXIT.REVIEW_FAILED,
      'Your changes contain no reviewable text lines — only binary files, renames or deletions. Nothing was sent to the model.',
    );
  }
  if (err instanceof DevDigestApiError && err.code === 'config_error') {
    return new CliError(
      EXIT.REVIEW_FAILED,
      `${err.message} Add the provider's API key in the web UI (Settings), then retry.`,
    );
  }
  return new CliError(EXIT.REVIEW_FAILED, commonErrorMessage(err, apiBaseUrl));
}
