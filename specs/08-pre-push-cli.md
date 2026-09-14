# Pre-push CLI — `devdigest review --mode working`

## Context

Blast Radius (`specs/07-blast-radius.md`) and the whole review flow only run
*after* a PR exists on GitHub: import repo → sync PRs → `POST /pulls/:id/review`.
By then the author has already pushed, and the feedback loop costs a round trip
through GitHub.

This feature moves the **same** review one step earlier — into the local working
copy, before `git push`. A developer runs one command in their repo, gets the
same structured findings the web UI shows for a PR, and gets a predictable exit
code so the command can later sit in a pre-push hook or a `just`/`make` target.

Hard constraint stated by the requester and adopted here: **reuse the reviewer
and the domain logic — do not build a second implementation for the CLI.**

## Scope

**In scope**

- A CLI entry point in `mcp-server/` (`src/cli.ts` + `src/cli/*`) exposing one
  command: `devdigest review --mode working`.
- One new, synchronous, **non-persisting** backend endpoint —
  `POST /reviews/adhoc` — that runs `reviewPullRequest` on a raw diff supplied
  by the caller and returns the grounded findings.
- A mode seam (`working` implemented, `staged`/`branch` named + rejected with a
  clear message).
- Terminal rendering of findings (severity / file / line / title / rationale /
  suggestion) and a documented exit-code contract, both described in `--help`.

**Not in scope**

- `--mode staged` and `--mode branch` behaviour. The seam exists; the cases
  throw a "not yet supported" error. No silent no-op, no partial implementation.
- Untracked files. `git diff HEAD` does not cover them; they are **excluded**,
  warned about at runtime, and documented in `--help` (see
  [Untracked files](#untracked-files)).
- Persistence. No `agent_runs` row, no `reviews`/`findings` rows, no run trace,
  no SSE run-bus, no entry in the web UI. A pre-push pass is not a PR review
  record.
- Repo-intel enrichment (repo map, callers digest, file-rank note), PR intent,
  and PR description in the prompt — all of them need a persisted repo/PR the
  local working copy does not have. See
  [Prompt parity](#prompt-parity-what-the-adhoc-review-does-and-does-not-get).
- A `bin/devdigest` global shim, `--fail-on` override, `--json` output,
  multi-agent fan-out, a git hook installer, any `client/` change, any DB
  migration, any change to `.mcp.json` or `./scripts/dev.sh`.

## Modules affected

- **mcp-server** — owns the CLI. New `src/cli.ts` (entry), `src/cli/*` (arg
  parsing, git access, diff-source seam, rendering, exit codes), reuses the
  existing `src/http/client.ts` + `src/http/errors.ts` verbatim. Also
  `package.json` (new script), `README.md`, `CLAUDE.md`.
- **server** — owns the review execution. New `src/modules/reviews/adhoc.ts`
  (service) + one route in `src/modules/reviews/routes.ts`. Reuses
  `adapters/git/diff-parser.ts`, `platform/container.ts`'s `llm()`, and
  `_shared/skill-render.ts`.
- **reviewer-core** — **unchanged**. `reviewPullRequest` and `countBlockers` are
  imported as-is; nothing is added to or modified in this package.
- **client** — untouched.
- **e2e** — untouched (the CLI is not a browser flow).

## Decisions

| Question | Decision |
|---|---|
| Where does the review actually run — new backend endpoint, or `reviewer-core` imported directly into `mcp-server`? | **New backend endpoint** `POST /reviews/adhoc`. Direct import would require a `@devdigest/reviewer-core` alias which transitively needs `@devdigest/shared` → `server/src/vendor/shared`, contradicting `mcp-server/CLAUDE.md:16-19` ("No `@devdigest/shared` path alias… intentional decoupling"), and would fork a second secrets/LLM-provider resolution path (`server/src/adapters/llm/*` + `LocalSecretsProvider`) into a second package. The endpoint keeps mcp-server a thin HTTP client and makes "the same Structured Reviewer as the web UI" literally the same process and code path. |
| How does the CLI pick a system prompt / model? | **A required `--agent <id\|name>` flag.** The brief does not mention one; `reviewPullRequest` has no default identity (`systemPrompt`, `model`, `strategy`, `ci_fail_on` all come from an agent row), so a "default agent" would have to be invented. Instead: `--agent` is required, and omitting it exits 2 after printing the workspace's agents (fetched from `GET /agents`, falling back to plain usage text if the backend is unreachable). This is the gap in the brief, closed explicitly. |
| Does the diff get parsed client- or server-side? | **Server-side.** The CLI POSTs raw `git diff HEAD` stdout as a string; the endpoint calls the existing `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts:14`), exactly as `diffFromPrFiles` (`server/src/modules/reviews/diff-loader.ts:43`) already does. mcp-server never parses a diff, so no parser copy exists. |
| Which severities are "blocking"? | Whatever `countBlockers(findings, agent.ciFailOn)` (`reviewer-core/src/output/to-review.ts:48`) already says for the PR flow (`run-executor.ts:387`). The endpoint returns the computed `blockers` count and the gate that produced it; the CLI only checks `blockers > 0`. **No new threshold is defined anywhere.** |
| Untracked files | Excluded, warned about at runtime (count + first few paths, on stderr), and documented in `--help`. |
| Where does the request/response contract live? | Local zod schema in `server/src/modules/reviews/routes.ts` (the pattern `CreateAgentBody` in `agents/routes.ts:33` already uses), **not** in `vendor/shared/contracts/`. Nothing in `client/` consumes it, and adding a shared contract would force the by-hand dual-copy edit root `CLAUDE.md` warns about. mcp-server defines its own local `Raw…` interfaces, per its own convention. |
| Synchronous or fire-and-forget? | **Synchronous.** Unlike `POST /pulls/:id/review` (fire-and-forget — `mcp-server/CLAUDE.md:46-48`), `POST /reviews/adhoc` returns the finished review in the response body. There is nothing to persist and no run id to poll, so the SSE-completion machinery `run_agent_on_pr` needs does not apply. Marked in the route docstring so nobody "fixes" it into the fire-and-forget shape. |
| Invocation | `pnpm --dir mcp-server exec tsx src/cli.ts review --mode working` (the same cwd-independent form `.mcp.json` uses), plus a `"review": "tsx src/cli.ts review"` script in `mcp-server/package.json`. A `bin` entry is deferred — `src/cli.ts` is TypeScript with no build step, so `bin` needs a spawn wrapper that must also forward the child's exit code, which is machinery for no functional gain. *(My judgment call — the brief left this open.)* |
| Arg parsing | Hand-rolled in `src/cli/args.ts`. No parsing library; the package's only deps today are `zod` + the MCP SDK, and the surface is one command with three flags. |
| Colour output | None. Plain ASCII severity labels, deterministic and pipe-safe. *(My judgment call.)* |

## Architectural constraints

Pulled from the files, not from memory:

- `mcp-server/CLAUDE.md:16-19` — **no `@devdigest/shared` path alias**; every
  contract is redefined locally as a minimal-subset interface. The CLI's view of
  the endpoint's response must be local `Raw…` interfaces in `src/cli/`, exactly
  as `get-blast-radius.ts:18-52` does for `GET /pulls/:id/blast`.
- `mcp-server/CLAUDE.md:20-23` — `src/http/client.ts` is the **only** module
  allowed to call `fetch()`; every layer above takes the client as an argument
  and is tested against a hand-written fake `fetchImpl`, never module-level
  mocking. The CLI reuses `DevDigestHttpClient` unchanged; it does not open its
  own connection.
- `mcp-server/CLAUDE.md:24-30` — tool descriptions and `src/tools/index.ts`
  registration order must stay byte-identical. **This work must not touch
  `src/tools/` at all** — the CLI adds no MCP tool.
- `mcp-server/CLAUDE.md:38-39` — `./scripts/dev.sh` must not learn about this
  package. Unchanged here.
- `mcp-server/CLAUDE.md:11-14` / `specs/06-mcp-server.md:161-169` — mcp-server is
  a sibling package with no domain model and no persistence; the
  `onion-architecture` skill excludes it *by the skill's own stated scope*, not
  by an exception. The CLI keeps that identity: git I/O + HTTP + rendering, zero
  review logic.
- `server/CLAUDE.md:12-14` — routes are schema-first: the new route declares a
  zod `body`; the handler never hand-rolls `Schema.parse(req.body)`.
- `server/CLAUDE.md:17-18` — adapters sit behind `platform/container.ts` DI;
  tests swap `src/adapters/mocks.ts`, never module-level mocks. The adhoc service
  takes narrow ports and is composed in `routes.ts`.
- `server/CLAUDE.md:19-21` — secrets are **not** in `AppConfig`; they resolve
  through `SecretsProvider` (`~/.devdigest/secrets.json`, mode `0600`). This is
  the single strongest reason the LLM call stays server-side: there is exactly
  one secrets reader in the system and it stays that way.
- `onion-architecture` (skill) + `specs/07-blast-radius.md:107-118` — routes are
  adapters (parse → one service call → return); a service must not import
  another module's concrete repository class (dependency-cruiser
  `no-cross-module`). Declare narrow local ports, satisfied structurally by the
  container's objects, wired in `routes.ts` — the pattern `AgentLookup`
  (`server/src/modules/reviews/service.ts:8-11`) and `PrFileLookup`
  (`server/src/modules/blast/routes.ts:19-22`) already establish.
- `run-executor.ts:11-13` — `renderSkillBlock` (`_shared/skill-render.ts:24`) is
  **THE one skill renderer**; never re-implement that formatting. The adhoc
  service must call it, not format skill blocks itself.
- `reviewer-core/CLAUDE.md:24-30` — `groundFindings` is the mandatory citation
  gate and `INJECTION_GUARD` is the one shared injection defense. Both already
  run inside `reviewPullRequest`; nothing here may bypass or duplicate them.
- Root `CLAUDE.md` "Do-not-touch" — `server/src/vendor/shared` and
  `client/src/vendor/shared` are unsynced copies. Avoided entirely by keeping the
  new contract local to the route (see Decisions).

## Backend investigation (read before implementing)

Confirmed by reading the code:

- **`reviewPullRequest` needs no PR.** `ReviewInput`
  (`reviewer-core/src/review/run.ts:44-108`) requires only
  `{ systemPrompt, model, diff, llm }`; `strategy`, `skills`, `callers`,
  `repoMap`, `prDescription`, `intent`, `task` are all optional and their
  sections are omitted when absent. Grounding, scoring and the reduce step all
  run unconditionally inside it (`run.ts:208-236`).
- **`run-executor.ts` is not reusable here.** `runOneAgent`
  (`run-executor.ts:204-464`) wraps the engine in DB persistence
  (`insertReview`/`insertFindings`/`completeAgentRun`/`saveRunTrace`), SSE
  fan-out (`RunLogger` + `container.runBus`), and repo-intel/intent enrichment
  that all need a persisted `PullRow`/`repoId`. Reuse the ~15 lines of engine
  invocation it performs (`run-executor.ts:283-318`), not the class.
- **`parseUnifiedDiff` (`adapters/git/diff-parser.ts:14`) does not crash on
  binary files, pure renames, or deletions — it silently drops them.** A file
  entry is only kept when a `+++ b/<path>` line set a non-empty `path`
  (`diff-parser.ts:78`). Binary diffs (`Binary files … differ`) and content-free
  renames have no `+++` line; deletions have `+++ /dev/null`, which the parser
  deliberately does not assign (`diff-parser.ts:42`). Consequences the
  implementation must handle:
  1. The dropped files still appear in `diff.raw`, which is what the prompt
     carries (`run.ts:160,165`) — so the model *can* comment on them, but
     `groundFindings` will drop those findings for lack of a hunk.
  2. If every changed file is of that kind, `files.length === 0` and there is
     nothing reviewable → the endpoint must 422 with a clear message rather than
     burn an LLM call on it.
- **`GET /agents` already returns `ci_fail_on`** (`toAgentDto`,
  `server/src/modules/agents/helpers.ts:12-27`); the column defaults to
  `'critical'` (`server/src/db/schema/agents.ts:25-27`). The CLI still does not
  compute blockers itself — the endpoint returns the count.
- **Global body limit is 1 MB** (`server/src/app.ts:48`,
  `bodyLimit: 1_048_576`). A working-tree diff can exceed that, and the failure
  today would be an opaque 413. The new route needs its own larger `bodyLimit`
  and the CLI needs a matching pre-flight cap.
- **`AgentsRepository.enabledSkills(agentId)`
  (`server/src/modules/agents/repository.ts:230`)** returns
  `{ id, name, type, body }` rows — exactly what `renderSkillBlock` consumes.
- **No auth plumbing.** `getContext` (`_shared/context.ts`) resolves the default
  workspace/user via `LocalNoAuthProvider` regardless of headers.

## Approach

### 1. Server — `POST /reviews/adhoc`

**New file `server/src/modules/reviews/adhoc.ts`** — `AdhocReviewService`, a
thin application service with narrow, consumer-declared ports (no `Container`
import, no Drizzle, no cross-module imports):

- ports: an agent lookup (`getById(workspaceId, id)` — the same shape
  `AgentLookup` at `service.ts:8-11` declares), a skill lookup
  (`enabledSkills(agentId)`), and an LLM resolver
  (`(provider) => Promise<LLMProvider>`).
- `review({ workspaceId, agentId, diff })`:
  1. `getById` → `NotFoundError('Agent not found')` when missing.
  2. `parseUnifiedDiff(diff)` → when `files.length === 0`, throw a 4xx
     `AppError` whose message names the binary/rename/delete cause (see
     Backend investigation).
  3. resolve `llm(agent.provider)` — `ConfigError` propagates as-is when the
     provider key is missing (same behaviour as the PR flow).
  4. `enabledSkills(agent.id)` → `renderSkillBlock` per skill (the one shared
     renderer — never re-format here).
  5. `reviewPullRequest({ systemPrompt, model, diff, llm, strategy, skills?,
     task })` — the *identical* call shape as `run-executor.ts:283-318` minus
     the slots that need a PR. `task` is a module constant, e.g. `Review the
     local working-copy changes below. They are uncommitted and have not been
     pushed yet.`
  6. `countBlockers(outcome.review.findings, agent.ciFailOn)` — the same
     function, the same gate value as `run-executor.ts:387`.
  7. return the response body below. **Nothing is written to the DB and
     `runBus` is never touched.**

**Edit `server/src/modules/reviews/routes.ts`** — one route, composed the same
way `blast/routes.ts:24` composes its service:

```
POST /reviews/adhoc
  body:      { agent_id: uuid, diff: non-empty string }   // local zod schema
  bodyLimit: 5 MB (route-level; overrides app.ts's 1 MB)
  rateLimit: { max: 10, timeWindow: '1 minute' }          // mirrors POST /pulls/:id/review
  →  { agent: { id, name, model, ci_fail_on },
       verdict, summary, score,
       findings: Finding[],        // grounded, from reviewer-core
       grounding: string,          // e.g. "3/4 passed"
       blockers: number,           // countBlockers(findings, agent.ci_fail_on)
       files_reviewed: number,     // parsed diff.files.length
       tokens_in, tokens_out, cost_usd }
```

Docstring must state: synchronous, non-persisting, no run row, no SSE — the
deliberate opposite of `POST /pulls/:id/review`.

### 2. mcp-server — the CLI

New files (nothing under `src/tools/` changes):

| File | Responsibility |
|---|---|
| `src/cli.ts` | Entry point. Builds `Config` + `DevDigestHttpClient` + a real `GitRunner`, calls `runCli(argv, deps)`, `process.exit(code)`. Thin; tests bypass it. |
| `src/cli/run.ts` | `runCli(argv, deps): Promise<number>` — the whole flow, fully injectable (`git`, `http`, `stdout`, `stderr`, `cwd`). The one place the exit code is decided. |
| `src/cli/args.ts` | Hand-rolled parser + the verbatim `HELP_TEXT`. |
| `src/cli/exit.ts` | `EXIT` code constants + `CliError { code, message }`. |
| `src/cli/git.ts` | `GitRunner` interface + the real `child_process` implementation, and `findRepoRoot(cwd, git)`. **The only module in this package allowed to spawn a child process** — same rule shape as "only `client.ts` calls `fetch()`". |
| `src/cli/diff-source.ts` | The mode seam: `resolveDiff(mode, ctx)`. |
| `src/cli/render.ts` | Findings → terminal text. Pure, string-in/string-out. |
| `test/cli/*.test.ts` | One per module above, fake `GitRunner` + fake `fetchImpl`. |

**Flow** (`runCli`):

1. Parse argv. `--help`/`-h` → print `HELP_TEXT`, exit 0. Unknown flag, unknown
   `--mode` value, or missing `--agent` → exit 2 (missing `--agent` first tries
   `GET /agents` to list the real ids).
2. `findRepoRoot` — `git rev-parse --show-toplevel` from `cwd`. Non-zero exit or
   `git` not on PATH → `CliError(EXIT.ENVIRONMENT)`.
3. `resolveDiff(mode, { repoRoot, git })` (see below) → raw diff text.
4. Empty/whitespace-only diff → print "No tracked changes to review." → **exit
   0**. (Nothing changed means nothing blocking; a pre-push hook must not fail
   here.)
5. Warn on untracked files (stderr) — see [Untracked files](#untracked-files).
6. Diff byte length > `MAX_DIFF_BYTES` (5 MB, matching the route's `bodyLimit`)
   → `CliError(EXIT.ENVIRONMENT)` with a message suggesting narrowing the
   change. Checked **before** any HTTP call.
7. Resolve the agent: `GET /agents`, match `--agent` against `id` first, then a
   case-insensitive exact `name`. Zero matches / multiple name matches → the
   same forward-leading message shape `resolvers/repo.ts` uses (list the
   candidates).
8. `http.post('/reviews/adhoc', { agent_id, diff }, ADHOC_REVIEW_TIMEOUT_MS)`
   with `ADHOC_REVIEW_TIMEOUT_MS = 180_000` — the client's
   `DEFAULT_TIMEOUT_MS` (15 s, `http/client.ts:13`) is far too short for an LLM
   call. Progress line to **stderr** while waiting.
9. Render findings to **stdout**; diagnostics, warnings and the progress line go
   to **stderr**, so `devdigest review --mode working > report.txt` yields a
   clean report.
10. `blockers > 0` → exit 1, else exit 0.

### 3. The `--mode` seam

`src/cli/diff-source.ts`:

- `export type ReviewMode = 'working' | 'staged' | 'branch'` and
  `export const REVIEW_MODES: readonly ReviewMode[]` — all three are *valid
  flag values*, so an unimplemented one produces the seam's own explanatory
  message, not "unknown mode".
- `export async function resolveDiff(mode, ctx): Promise<string>` — a `switch`
  over the mode:
  - `working` → `git diff HEAD` run in `ctx.repoRoot`; stdout returned as-is.
    Covers staged **and** unstaged changes to tracked files.
  - `staged` → `throw new CliError(EXIT.USAGE, "--mode staged is not
    implemented yet (planned: git diff --cached). Use --mode working, which
    already includes your staged changes.")`
  - `branch` → `throw new CliError(EXIT.USAGE, "--mode branch is not
    implemented yet (planned: git diff <merge-base>...HEAD). Use --mode working
    for uncommitted changes, or open a PR and review it in the web UI.")`
- `--help` lists all three with `(not yet implemented)` on two of them.

Adding `staged` later is a one-case edit here plus one `--help` line: no other
module knows what a mode is.

### Untracked files

`git diff HEAD` covers staged and unstaged changes to **tracked** files only.
Untracked files are excluded. Two things make that non-silent:

1. Runtime: `git ls-files --others --exclude-standard` in `repoRoot`; when
   non-empty, print to stderr —
   `Note: N untracked file(s) not reviewed (git diff HEAD only covers tracked files): <first 3 paths>[, …]. Run 'git add' on them first to include them.`
   (`git add` alone stages them into `git diff HEAD`, so this is actionable.)
2. Documented in `--help` (below).

### Output format

Sorted by severity rank descending (CRITICAL → WARNING → SUGGESTION, the same
ordering `SEV_RANK` at `reviewer-core/src/output/to-review.ts:23` defines),
then by file path ascending, then by `start_line` ascending. One block per
finding, two-space continuation indent, no colour:

```
devdigest review — working tree (12 file(s), agent "Security Reviewer")

CRITICAL  server/src/modules/reviews/adhoc.ts:88-92  Unbounded diff read into memory
  The whole diff is buffered before the size check, so a 500 MB working tree
  allocates before it is rejected.
  Suggestion: check the byte length while streaming.

WARNING   mcp-server/src/cli/git.ts:31  Child process inherits the caller's env
  ...

3 finding(s) · 1 critical · 1 warning · 1 suggestion — 1 blocking (gate: critical)
Citation grounding: 3/4 passed
Note: no repo-map, caller or PR-intent context — this is the pre-push pass.

Blocking findings present — exiting 1.
```

Zero findings → `No findings. Looks good.` plus the grounding line, exit 0.
The severity/file/line/title header line is the required minimum; the
rationale + suggestion lines are included because a bare title is not
actionable in a terminal where there is no "expand" affordance.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Review ran; **no** blocking findings. Also: empty diff, and `--help`. |
| 1 | Review ran; **≥1 blocking finding** (`blockers > 0`, gate = the agent's `ci_fail_on`). |
| 2 | Usage error — unknown flag, unknown/unimplemented `--mode`, missing `--agent`, agent not found or ambiguous. |
| 3 | Environment error — not a git repo, `git` not on PATH, diff exceeds the size cap. |
| 4 | Review failed to run — backend unreachable, timeout, 4xx/5xx from the API, provider key missing, nothing reviewable in the diff. |

"Non-zero if blocking findings OR the review failed to run" is satisfied by
1/2/3/4; the split exists so a hook can tell "the code has problems" (1) from
"the tool could not run" (2/3/4).

### `--help` text (verbatim)

```
devdigest review — review your local changes before you push.

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
  --mode working collects `git diff HEAD`: every staged and unstaged change to a
  tracked file. UNTRACKED FILES ARE NOT REVIEWED — `git diff HEAD` does not see
  them. `git add` them first to include them. Binary files, pure renames and
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
```

### Error handling

Same "forward-leading, never a bare error" bar as
`specs/06-mcp-server.md` §Error handling. `commonErrorMessage`
(`src/http/errors.ts:71`) is reused for the generic rows.

| Failure | Detected by | Exit | Message |
|---|---|---|---|
| Not a git repository | `git rev-parse --show-toplevel` non-zero | 3 | "Not a git repository (or any parent up to the filesystem root). Run this from inside your repo's working copy." |
| `git` not on PATH | spawn `ENOENT` | 3 | "`git` was not found on your PATH. Install git, or run this from a shell where `git --version` works." |
| Diff larger than the cap | byte length > 5 MB | 3 | "Your working-tree diff is `<n>` MB, over the 5 MB limit. Commit or stash part of the change and review it in smaller pieces." |
| Empty diff | empty stdout | **0** | "No tracked changes to review. (Untracked files are not included — `git add` them first.)" |
| Unknown `--mode` value | not in `REVIEW_MODES` | 2 | "Unknown mode '`<v>`'. Valid modes: working, staged (not yet implemented), branch (not yet implemented)." |
| `staged`/`branch` requested | `resolveDiff` switch | 2 | The seam's own message (see [The `--mode` seam](#3-the---mode-seam)). |
| `--agent` missing | parser | 2 | "--agent is required — an agent supplies the system prompt, model and blocking gate. Available agents: `<id — name (model)>` …" (falls back to plain usage text if `GET /agents` fails). |
| Agent not found | zero matches in `GET /agents` | 2 | "Agent '`<input>`' not found. Available agents: `<list>`." |
| Ambiguous agent name | >1 name match | 2 | "'`<input>`' matches multiple agents: `<list>`. Retry with the agent id." |
| Nothing reviewable in the diff | endpoint 4xx, `files_reviewed === 0` case | 4 | "Your changes contain no reviewable text lines — only binary files, renames or deletions. Nothing was sent to the model." |
| Provider key missing | endpoint 4xx from `ConfigError` | 4 | The API's message, plus "Add the provider's API key in the web UI (Settings), then retry." |
| Rate limited | **HTTP status 429** — never `error.code` (`http/errors.ts:41-52`, `mcp-server/LEARNINGS.md`) | 4 | "Rate limited: more than 10 reviews were requested in the last minute. Wait a bit and retry." |
| Backend unreachable / timeout | `DevDigestNetworkError` / `DevDigestTimeoutError` | 4 | `unreachableMessage(baseUrl)` (`http/errors.ts:55`) as-is. |
| Unexpected 5xx | status ≥ 500 | 4 | `unexpectedServerErrorMessage` (`http/errors.ts:60`) as-is. |

### Prompt parity — what the adhoc review does and does not get

Identical to the PR flow: system prompt, model, strategy, the agent's enabled
skill blocks (via the one shared `renderSkillBlock`), the diff, the citation
grounding gate, `INJECTION_GUARD`, the score-from-survivors rule.

Deliberately absent, because each needs a persisted repo/PR: repo map, callers
digest, file-rank note, PR description, PR intent. The CLI prints the one-line
"no repo-map, caller or PR-intent context" note so the difference is visible to
the user rather than silently narrowing the review.

## Skills for implementer

Based on the routing table in `.claude/skills/pr-self-review/SKILL.md` Phase 3
(lines 129-141) and the catalog in `.claude/skills/README.md`. **Cap is 4 per
review pass** — split by file group as below rather than loading all at once.

| Files | Skills | Why |
|---|---|---|
| `server/src/modules/reviews/adhoc.ts`, `server/src/modules/reviews/routes.ts` | `onion-architecture`, `fastify-best-practices` | Table row `server/src/modules/**` → both. New service + new route: ring placement, narrow ports over container imports, route-as-adapter, per-route `bodyLimit`/`rateLimit`, error handling. |
| The zod body schema inside `server/src/modules/reviews/routes.ts` | `zod` | Table row `**/contracts/**`, zod schemas. Schema-first route body per `server/CLAUDE.md:12-14`. |
| all new `.ts` in both packages | `security` | Table row `any .ts/.tsx`. Two live concerns here: the CLI spawns `git` (argument construction, never a shell string), and the endpoint accepts an arbitrary attacker-influenceable diff blob that becomes untrusted prompt content. |
| `mcp-server/src/cli.ts`, `mcp-server/src/cli/**`, `mcp-server/test/cli/**` | **Gap — no row covers `mcp-server/**`.** Use `typescript-expert` (the closest analogue: the table routes the other alias-free sibling package, `reviewer-core/**`, to `typescript-expert` only) **+ `security`**. Explicitly **do not** load `onion-architecture` — `specs/06-mcp-server.md:161-169` records that it excludes this package by its own stated scope. | Recorded as a routing-table gap; worth adding an `mcp-server/**` row to `pr-self-review` Phase 3 in a follow-up, but not silently invented here. |

Not applicable: `drizzle-orm-patterns` and `postgresql-table-design` (no schema,
no migration, no Drizzle query — the adhoc path persists nothing);
`frontend-ui-architecture`, `next-best-practices`, `react-best-practices`,
`react-testing-library` (no `client/` change).

Before finishing: `engineering-insights` for `mcp-server/LEARNINGS.md` and
`server/LEARNINGS.md`. The `parseUnifiedDiff` silently-drops-binary/rename/
deletion behaviour is exactly the kind of non-obvious finding those files exist
to hold.

## Testing approach

**Hermetic — covered by `pnpm test`:**

*mcp-server* (fake `GitRunner` + fake `fetchImpl`, no real git, no network — the
package's existing DI convention, `mcp-server/CLAUDE.md:20-23`):

- `args.ts`: `--help`; missing `--agent`; unknown flag; each `--mode` value;
  flag-after-flag and `--flag=value` forms if supported.
- `diff-source.ts`: `working` issues exactly `['diff','HEAD']` in `repoRoot`;
  `staged` and `branch` each throw `CliError` with their specific message and
  `EXIT.USAGE`.
- `git.ts`: `findRepoRoot` success; non-zero exit → environment error; `ENOENT`
  → the "git not on PATH" message.
- Untracked warning: fake returns 2 paths → the warning line appears **on
  stderr** and the review still proceeds.
- `render.ts`: canned findings → exact expected string, asserting severity
  ordering, then file, then line; the counts footer; the zero-findings branch;
  the grounding + context-note lines.
- `run.ts` exit-code matrix: `blockers > 0` → 1; `blockers === 0` → 0; empty
  diff → 0 **and no HTTP call**; oversize diff → 3 **and no HTTP call**; agent
  not found → 2; 404/429/500/network/timeout from the fake `fetchImpl` → 4 with
  the mapped message. Include the **429-by-HTTP-status** regression assertion
  (`error.code: "internal_error"` in the body, status 429) that
  `test/http/client.test.ts` already establishes.

*server*: `modules/reviews/adhoc.test.ts` — pure unit over `AdhocReviewService`
with a stub `LLMProvider` and stub lookups, mirroring
`modules/blast/service.test.ts`. Asserts: skills are rendered via
`renderSkillBlock`; `reviewPullRequest` receives the expected input shape;
`blockers` equals `countBlockers(findings, agent.ciFailOn)` for each `ci_fail_on`
value; a diff parsing to zero files throws before any LLM call; **no repository
write method is ever called**.

**Needs the real dev stack — manual, not part of `pnpm test`** (same carve-out
`specs/06-mcp-server.md` §Testing approach makes):

- `./scripts/dev.sh --no-client`, a real dirty working copy, a real agent with a
  real provider key: run the command and confirm findings + exit code
  (`echo $?`), once with a clean tree (exit 0), once with a deliberately broken
  file (exit 1), once with the API stopped (exit 4).
- One run with an untracked file present, confirming the warning and that the
  file's contents are absent from the review.

No `*.it.test.ts`: mcp-server has no DB, and the adhoc service touches none.

## Changes outside `mcp-server/`

1. **`server/src/modules/reviews/adhoc.ts`** (new) — `AdhocReviewService`.
2. **`server/src/modules/reviews/adhoc.test.ts`** (new) — hermetic unit.
3. **`server/src/modules/reviews/routes.ts`** (edit) — one zod body schema, one
   `POST /reviews/adhoc` route, service composition. No new module registration
   in `modules/index.ts` (this lives in the module that already owns review
   execution, so the engine-invocation knowledge is not duplicated across two
   modules).
4. **`server/README.md`** (edit) — add `/reviews/adhoc` to the `reviews` node in
   the API-map mermaid diagram (§"API map (starter)", ~line 72).
5. **Root `CLAUDE.md`** (edit, one line) — add the pre-push command to
   §Commands. The Map table already has an `mcp-server` row (added by spec 06);
   no change there.

Not changed: `client/`, `e2e/`, `reviewer-core/`, `.mcp.json`,
`./scripts/dev.sh`, `server/src/vendor/shared`, any migration.

## Implementation order

1. `server/src/modules/reviews/adhoc.ts` + `adhoc.test.ts` — the service, with
   stub ports. Green before any route exists.
2. `reviews/routes.ts` — zod body, `bodyLimit`, `rateLimit`, composition.
   Smoke it with `curl` against a hand-made diff file.
3. mcp-server scaffolding: `src/cli/exit.ts`, `src/cli/args.ts` (+ `HELP_TEXT`),
   with tests. *(parallel with 4)*
4. `src/cli/git.ts` + `src/cli/diff-source.ts`, with tests. *(parallel with 3)*
5. `src/cli/render.ts`, with tests.
6. `src/cli/run.ts` — wire it together; the exit-code matrix tests.
7. `src/cli.ts` + the `"review"` script in `package.json`.
8. Manual smoke against the real dev stack (all four exit codes).
9. `mcp-server/README.md` (new CLI section + the command), `mcp-server/CLAUDE.md`
   (two new non-default conventions: the CLI shares `src/http/*` and adds no MCP
   tool; `src/cli/git.ts` is the only module allowed to spawn a child process),
   the two changes in [Changes outside](#changes-outside-mcp-server), and the
   `LEARNINGS.md` entries.

## Verification

- `cd server && pnpm typecheck && pnpm test` — clean; `adhoc.test.ts` green;
  dependency-cruiser reports no new cross-module violation for
  `modules/reviews/adhoc.ts`.
- `cd mcp-server && pnpm typecheck && pnpm test` — clean; all new `test/cli/*`
  green; the existing `test/tools/*` untouched and still green (the CLI must not
  have perturbed any tool module or the registration order).
- With `./scripts/dev.sh --no-client` running and a provider key configured, in
  a repo with real uncommitted changes:
  - `pnpm --dir mcp-server exec tsx src/cli.ts review --mode working --agent <id>; echo $?`
    → findings printed with severity, file and line; `0` on a clean pass, `1`
    when a CRITICAL finding is present under a `critical` gate.
  - Same command with `--mode staged` → the "not implemented yet" message and
    `2`; the process makes **no** HTTP call.
  - Same command from `/tmp` (not a git repo) → the not-a-repo message and `3`.
  - Same command with the API stopped → `unreachableMessage` and `4`.
  - `--help` → the text above verbatim, including the exit-code table and the
    untracked-files paragraph.
- Cross-check parity: run the same agent on a PR whose diff is the same change
  (web UI or `run_agent_on_pr`) and confirm the finding set is comparable —
  differences should be attributable only to the absent repo-map/intent context,
  never to a different reviewer implementation.
- Confirm no rows were written: after a CLI run, `GET /pulls/:id/runs` and the
  web UI show nothing new.
