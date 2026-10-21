# PR Brief — server

A stored, per-PR brief: a summary, risk areas and a read-first list written by
exactly one model call, shown next to a verdict, score and counts that code
reads from the newest review. This file owns the API, the data model, the
generation rules and the trace contract. The UI half is
[`client/specs/pr-brief.md`](../../client/specs/pr-brief.md). How and why it is
built this way: [`../docs/pr-brief.md`](../docs/pr-brief.md).

Spec: specs/pr-brief.md (SPEC-03)

Status: **implemented 2026-10-21**. Generate is manual only: nothing creates or
refreshes a brief on its own, and a stale brief stays until the user asks.

## Data model (migration `0017_heavy_jackal.sql`)

| Table / column | Role |
|---|---|
| `agent_runs.kind` | `text` enum `review` \| `brief`, `NOT NULL DEFAULT 'review'` (`db/schema/runs.ts`); existing rows read as `review`. `agent_id` is null on a brief run. |
| `agent_runs_one_running_brief_uidx` | partial unique index on `agent_runs (pr_id)` where `kind = 'brief' and status = 'running'`: at most one running brief per PR |
| `agent_runs_pr_kind_ran_at_idx` | index on `(pr_id, kind, ran_at)` for the latest-run read |
| `pr_brief` (existing table, `db/schema/reviews.ts`) | one row per PR, `pr_id` cascades with the PR. `json` holds `{ summary, risks, review_focus }`; new nullable columns `generated_at`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `head_sha`, `source_review_id`, `run_id`, `files_total`, `files_included` |
| `run_traces` | the existing trace document of the run, one per brief run |

`pr_brief` has no `workspace_id`: reads and writes are scoped through
`pull_requests.workspace_id`. `pr_brief.run_id` and `source_review_id` are plain
uuid columns without a foreign key. `agent_runs.pr_id` keeps its existing
`ON DELETE SET NULL`.

## Configuration

`FEATURE_MODELS.risk_brief` (`vendor/shared/contracts/platform.ts`): label
"PR Brief", description "Writes the PR brief (summary, risks, review focus).",
default `openrouter` / `deepseek/deepseek-v4-flash`. A workspace override keeps
winning (`container.featureModel(workspaceId, 'risk_brief')`). The client
registry `client/src/lib/feature-models.ts` mirrors it.

Constants (`modules/pr-brief/constants.ts`):

| Constant | Value | Meaning |
|---|---|---|
| `MAX_FILE_CHARS` | 6,000 | characters of one file's patch sent to the model (also the cap on the PR body) |
| `MAX_TOTAL_CHARS` | 60,000 | summed patch characters; later files are named only |
| `MAX_FINDINGS` | 30 | findings sent; `MAX_RATIONALE_CHARS` = 200 per rationale |
| `MAX_SYMBOLS` / `MAX_CALLERS` | 10 / 5 | changed symbols sent / callers per symbol |
| `MAX_SUMMARY_CHARS` / `MAX_RISKS` / `MAX_FOCUS` | 400 / 5 / 6 | output trims |
| `BRIEF_CALL_TIMEOUT_MS` | 90,000 | deadline of the one model call, below the 120 s job timeout |
| `STALE_RUN_MS` | 10 min | a `running` brief run older than this is abandoned |
| `MAX_ERROR_CHARS` | 500 | longest error text stored on a failed run |
| `RATE_LIMIT` | `{ max: 6, timeWindow: '1 minute' }` | per-route limit on the POST |
| `TRACE_AGENT_NAME` / `TOOL_NAME` | `PR Brief` / `generate_brief` | `config.agent` and the one tool call of the trace |

The caps are constants, not settings.

## API (`modules/pr-brief/routes.ts`)

| Route | Input | Result |
|---|---|---|
| `GET /pulls/:id/brief` | path `id` (uuid) | `PrBriefView` `{ brief, review, run, stale }`, database only |
| `POST /pulls/:id/brief/generate` | path `id` | `202` `{ run: RunSummary }` with `kind: 'brief'`, `status: 'running'`; rate limit 6 per minute |

Both handlers call `getContext()` first. An unknown PR, or one of another
workspace, answers `404 not_found` in the standard error envelope.

`PrBriefView` (`vendor/shared/contracts/brief.ts`):

- `brief`: `PrBrief` or `null`. `PrBrief` is `summary`, `risks: Risk[]`,
  `review_focus: { path, line (nullable), reason }[]`, `generated_at`,
  `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (nullable),
  `head_sha`, `source_review_id` (nullable), `run_id` (nullable), `files_total`,
  `files_included`.
- `review`: `PrBriefReview` or `null`: `review_id`, `run_id`, `agent_name`
  (nullable), `verdict` (nullable), `score` (nullable), `findings_count`,
  `blockers`, `created_at`. Computed at read time from the newest review with
  `kind = 'review'` across all agents of the PR.
- `run`: the latest `kind = 'brief'` run as a `RunSummary`, or `null`.
- `stale`: boolean (see invariant 6).

`PrBriefDraft` (the strict shape stored after normalisation) is `{ summary,
risks, review_focus }` and has no verdict or score field; the model itself is
asked for the looser `PrBriefDraftLoose` (invariant 4a). `Risk.kind` is the closed enum `RiskKind`
(`auth`, `dependency`, `performance`, `data`, `api_change`, `config`, `other`);
`Risk.severity` is `high` \| `medium` \| `low`. `RunSummary` gains
`kind: 'review' | 'brief'` (`RunKind`, `contracts/trace.ts`).

Errors:

| Status | When |
|---|---|
| 404 | the PR is not in the workspace |
| 422 | malformed `:id` (route schema) |
| 429 | more than 6 POSTs per minute (the global limiter is off under `NODE_ENV=test`) |

A generation failure is never an HTTP error: the POST has already answered
`202`. It is a run with `status: 'failed'` and an `error` text, read through the
GET.

## Generation

`POST` → `PrBriefService.generate`:

1. Resolve the PR (404 when missing).
2. Read the latest brief run. Running and younger than `STALE_RUN_MS`: return it
   unchanged (no second run). Running and older: `failRun` it as abandoned
   ("Generation did not finish within 10 minutes and was abandoned") and go on.
3. Capture `head_sha` and the newest review id (`GenerateJobPayload`), resolve
   the feature model, `createRun` (`kind: 'brief'`, `agent_id` null,
   `status: 'running'`, `source: 'local'`). A `23505` from the partial unique
   index becomes a `ConflictError`; the service then returns the run that won.
4. `jobs.enqueue('pr-brief.generate', payload)` and answer `202`.

The job (`runGeneration`) never throws; the run row records the outcome.

Inputs, all chosen in code with no model call: PR title, branch and body (from
`pull_requests`); the changed files from the persisted `pr_files` patches in
Smart Diff role order (a file the classifier did not return follows in original
order); the non-dismissed findings of the newest review; the stored intent
when one exists (read through the intent port, never derived); the blast summary
(top 10 symbols, 5 callers each) when `REPO_INTEL_ENABLED` is on and the index is
not degraded. A file with no patch, or one that would push the total over the
cap, is listed by name only.

## Cross-model review of the plan

The plan was reviewed on 2026-10-21 by `deepseek/deepseek-v4-flash` through
OpenRouter, the same model that is now the `risk_brief` default. Verdict as the
reviewer gave it: FAIL, with one critical, one warning and one info finding.

| # | Severity | Finding | What was done |
|---|---|---|---|
| 1 | critical | `agent_runs.pr_id` delete rule contradicts spec EC-18 | rejected: the FK is a pre-existing `ON DELETE SET NULL` and stays; the spec's EC-18 was revised to match (invariant 9) |
| 2 | warning | the regenerate tooltip could name a stale model | accepted: Generate and regenerate tooltips name the workspace's current `risk_brief` model, the stored brief's model appears only in the (i) popover and the cost line |
| 3 | info | transport retries versus "exactly one call" | accepted: the spec's AC-21 was reworded; one structured call with no reprompt, a transport retry of the same request is not a second call (invariant 1) |

## Invariants

1. **One structured call, no reprompt.** `PrBriefService.runGeneration` makes one
   `llm.completeStructured({ schema: PrBriefDraftLoose, maxRetries: 0,
   temperature: 0, timeoutMs: BRIEF_CALL_TIMEOUT_MS })` wrapped in `withTimeout(…,
   BRIEF_CALL_TIMEOUT_MS)`. The model is sent the loose schema (below), then the
   result is normalised in code and parsed with the strict `PrBriefDraft`. No
   intent derivation, no second call after a schema failure. An adapter's transport retry of the same request after a 429 or 5xx
   (OpenRouter SDK default, `withRetry` in the OpenAI and Anthropic adapters) is
   not disabled and is not a second call. The trace lists one `generate_brief`
   tool call whose `meta` is `attempts=<n>`. Pinned: `test/pr-brief-service.test.ts`.
2. **Reads never call a model.** `PrBriefService.view` reads the database only:
   no model, GitHub or git call. Only `POST .../generate` can cost money. Pinned:
   `test/pr-brief.it.test.ts`.
3. **Verdict, score and counts are never model output.** `getNewestReview`
   (`pr-brief/repository.ts`) reads the newest `reviews.kind = 'review'` row
   across agents; `findings_count` is its non-dismissed findings, `blockers` the
   non-dismissed `CRITICAL` ones. `PrBriefDraft` has no such field. Pinned:
   `test/pr-brief.it.test.ts`, `test/pr-brief-helpers.test.ts`.
4. **Every reference is verified before it is stored.** `verifyDraft` drops a
   review-focus item whose `path` is not a changed file, and sets its `line` to
   null when the line is outside the new-side lines of that file's patch
   (`newSideLines`, same counting as the client diff viewer). A risk reference
   is `path`, `path:line` or `path:start-end`: an unknown path is dropped, a line
   or range with no rendered line keeps the bare path, a range that partly
   intersects is clipped to the first and last rendered line inside it. A risk is
   dropped when it had references and none survived; a risk with no references,
   or with some surviving, is kept. Nothing is added that the model did not
   return, so zero survivors give empty lists. Pinned: `test/pr-brief-helpers.test.ts`.
4a. **The model gets a loose schema; code normalises before the strict parse.**
   `PrBriefDraftLoose` (`pr-brief/helpers.ts`) takes `kind` and `severity` as
   strings, `line` as a number, a numeric string or null, and `file_refs` as an
   array of anything. `normaliseDraft` lowercases and trims `kind`/`severity`; an
   unknown `kind` becomes `other`, an unknown `severity` becomes `medium`; a
   numeric string `line` becomes an integer, any other non-integer becomes null;
   non-string refs are dropped. The result is then parsed with the strict
   `PrBriefDraft`, so a cased or stringly-typed value no longer fails the run, and
   a stored `Risk.kind` is always inside `RiskKind` for new briefs (the client's
   generic icon only covers older stored values). Still one call, `maxRetries: 0`,
   no reprompt. Pinned: `test/pr-brief-helpers.test.ts`.
5. **Output is trimmed in code.** `trimDraft`: summary at most 400 characters (an
   overlong one is cut with an ellipsis), at most 5 risks, at most 6 focus items,
   in the model's order. Fewer than 3 risks is stored as returned.
6. **Staleness is a comparison, not a flag.** `isStale`: the PR's current
   `head_sha` differs from `pr_brief.head_sha`, or the newest review's id differs
   from `source_review_id`. A changed feature model, a dismissed finding and an
   accepted finding do not set it. `head_sha` and the review id are captured when
   `generate` runs, so a review that lands mid-run makes the new brief stale.
   Pinned: `test/pr-brief.it.test.ts`.
7. **Success replaces the brief in one transaction; failure leaves it.**
   `PrBriefRepository.completeRun` upserts `pr_brief`, marks the run `done`
   (usage, `findings_count` 0, `grounding`) and upserts `run_traces` in one
   transaction. `failRun` writes `agent_runs` only. `view` reads the run first,
   then the brief and review, so a `done` run is never seen without its brief.
   A stored `json` that fails `PrBrief.safeParse` reads as no brief (`getStored`).
   Pinned: `test/pr-brief.it.test.ts`.
8. **One running brief per PR.** The partial unique index plus the `23505` →
   `ConflictError` mapping in `createRun`; a young running run is returned as is.
   A crash or hung provider leaves a `running` row that the next Generate fails
   after `STALE_RUN_MS`; the boot reaper (`reapStaleRunningRuns`) is kind-agnostic.
   Pinned: `test/pr-brief.it.test.ts`, `test/pr-brief-service.test.ts`.
9. **A deleted PR ends the job silently.** When the PR is gone at job start, or
   `completeRun` hits a `23503` (mapped to `NotFoundError`), the run is marked
   `failed` ("Pull request was removed") and the handler returns. The
   `agent_runs` row survives with `pr_id` null; `pr_brief` cascaded away.
   Pinned: `test/pr-brief-service.test.ts`.
10. **Failure texts.** Output that does not match `PrBriefDraft` (including an
    adapter's schema failure, `isSchemaFailure`) ends the run `failed` with "The
    model returned an invalid brief: `<parse issues>`": the cause is the Zod or
    JSON issues the OpenRouter adapter (`reviewer-core/src/llm/openrouter.ts`)
    appends, capped at 400 characters, never the raw model text. The same text is
    one `error` line of the run log, so it is also in the trace. A missing API key (`ConfigError`) ends it
    `failed` with "No API key configured for `<provider>`" (`runErrorText`). A
    call over the deadline fails with the timeout error. Every error text is
    capped at 500 characters. Pinned: `test/pr-brief-service.test.ts`.
11. **Brief runs stay out of the review views.** `activeRunsForPull` and
    `listRunsForPull` (`reviews/repository/run.repo.ts`) and `statsByAgent`
    (`agents/repository.ts`) filter `kind = 'review'`, so a brief never appears in
    the Run history, the active runs, or agent statistics. `costRollupForPulls`
    does not filter: the brief's cost is part of the PR list cost. Pinned (runs,
    active runs, list cost): `test/pr-brief.it.test.ts`; the agent stats filter is
    not asserted by a test.
12. **Untrusted text is data.** `buildMessages` wraps the PR title, branch,
    description, every patch, the findings, the intent, the blast digest and the
    named-only list in `<untrusted source="…">` blocks and neutralises a closing
    tag inside them; `prompts/pr-brief.system.md` states that these blocks are
    data, forbids a verdict, a score and quoting a secret value. Pinned:
    `test/pr-brief-helpers.test.ts`.
13. **Workspace scoping.** `getPull`, `getPrFiles`, `getStored`, `getLatestRun`,
    `saveTrace` and `failRun` take `workspaceId`; `pr_brief` is scoped through
    `pull_requests`. `GET /runs/:id/trace`, which opens the brief's trace from the
    card, is unchanged and is not workspace-scoped (known, same as review traces).
14. **The rate limit is wired, not exercised.** `RATE_LIMIT` is passed as
    `config.rateLimit` on the POST. The global limiter is off under test, so only
    the constant is asserted (`test/pr-brief.it.test.ts`).

## Trace

One `run_traces` document per brief run (`buildTrace`, validated with
`RunTrace.parse`): `config.agent = "PR Brief"`, `provider`, `model`, `pr`;
`stats` with duration, `tokens_in`, `tokens_out`, `cost_usd`, `findings: 0` and
`grounding = "<kept>/<total> refs kept"`; `prompt_assembly` with `system`, `user`,
`pr_description`, `intent`; one `tool_calls` entry `generate_brief`
(`args = <provider>/<model>`, `meta = attempts=<n>`, `ms`); `raw_output`; the
log lines. The log is written through `RunLogger` (SSE bus, trace, pino) and
carries counts, paths and ids only: the inputs and caps applied
(`Inputs: <included>/<total> files with patches (<n> named only), <n> findings,
intent yes|no, blast yes|no`), the blast skip reason, the call
(`Calling <provider>/<model>`), `Refs kept <k>/<n>; <d> item(s) dropped` and
`Brief stored`. A failed run writes a trace as well, with whatever was reached
(empty prompt fields when it failed before the prompt was built).

## Seed

`db/seed.ts` adds, for the demo PR #482, a done brief run with a trace and a
`pr_brief` row (three risks, three focus items whose lines are in the seeded
patches, cost $0.0021). The PR-list cost of #482 is therefore the review run plus
the brief run ($0.0034).

## Not in this feature

No MCP tool, no automatic generation or regeneration, no cancel, no per-brief
model picker, no brief on the PR list or timeline.
