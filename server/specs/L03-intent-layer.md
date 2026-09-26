# Intent Layer (PR intent → review)

**Status:** in-progress
**Lesson / ticket:** L03

## Goal

For each PR, the server derives a **intent**: one sentence plus IN SCOPE /
OUT OF SCOPE, from the PR's title, body, a linked ticket, a linked spec/plan
and indirect signals (branch, commits, changed paths). A separate cheap
model call does this — its model is chosen in Settings → Models → "PR Review
· Intent". The intent carries a **deterministic confidence level**
(high / medium / low + basis) and a **list of sources** with statuses.

The intent:

1. appears on Overview → an "Intent" card (empty / loading / error / ready /
   stale states);
2. runs automatically as pre-work in `executeRuns`, is cached by input hash,
   and is passed into the reviewer prompt as an untrusted block
   `## PR intent (derived …)`. If deriving it fails, the review still
   proceeds without it.

## Non-goals

- Fetching external URLs (Jira / Linear / Notion / any non-GitHub host).
  These are recorded only as `external_link`, `unresolved`. No outbound HTTP
  request to a URL taken from the PR author.
- Fetching issues from **other** GitHub repos (`other/repo#N`). Recorded as
  `unresolved`, reason `other_repo`.
- Intent call cost is **not** added to `agent_runs.cost_usd` or to the PR
  list's Cost column. It is stored on the `pr_intent` row and shown on the
  card.
- Smart Diff, Risk Brief, Blast radius, `PrBrief` / `pr_brief`. The `Intent`
  contract in `brief.ts:9` is unchanged.
- Clickable links to sources in the UI: sources render as plain text.
- Fixing existing onion exceptions (`conventions/service.ts` sideways
  imports, `pulls` Drizzle-in-handler).
- Seed row `pr_intent` for PR #482: the seed stays without intent so e2e can
  see the empty state.

## Contract

**Shared contracts** (`server/src/vendor/shared/`, mirrored in
`client/src/vendor/shared/`):

- `contracts/brief.ts` — `IntentConfidence`, `IntentConfidenceBasis`,
  `IntentSourceKind`, `IntentSourceStatus`, `IntentSourceReason`,
  `IntentSource` (added after `Intent`; `Intent` itself is unchanged).
- `contracts/review-api.ts` — `PrIntentRecord` (extends `Intent` with
  `pr_id`, `confidence`, `confidence_basis`, `downgraded`, `sources`,
  `head_sha`, `stale`, `provider`, `model`, `tokens_in`, `tokens_out`,
  `cost_usd`, `generated_at`), `PrIntentResponse`, `DeriveIntentRequest`,
  `DeriveIntentResponse`.
- `contracts/trace.ts` — `PromptAssembly.intent: z.string().nullish()`.
- `adapters.ts` — `GitHubClient.getFileContent(repo, path, ref): Promise<string | null>`
  (null on 404 / directory / non-file; throws on other errors).
- `contracts/platform.ts` — `FEATURE_MODELS.review_intent` default provider
  `openrouter`, model `deepseek/deepseek-v4-flash` (mirrored in
  `client/src/lib/feature-models.ts`).

**Routes** (new module `server/src/modules/intent/`):

- `GET /pulls/:id/intent` → 200 `PrIntentResponse`. 404 if the PR isn't in
  the workspace. 422 for a non-uuid id.
- `POST /pulls/:id/intent` body `DeriveIntentRequest` → 200
  `DeriveIntentResponse`. Rate-limited `{max: 10, timeWindow: '1 minute'}`.
  LLM failure → 502 `ExternalServiceError`; missing provider key → 500
  `ConfigError` with its message.

## Data sources

Priority: linked spec/plan > linked ticket > description > commits >
branch/title > changed paths.

| Kind | From | Cap (`modules/intent/constants.ts`) |
|---|---|---|
| `title` | `pull_requests.title` | — |
| `description` | `pull_requests.body` | `MAX_BODY_CHARS = 6000` |
| `branch` | `pull_requests.branch` | — |
| `commits` | `pr_commits.message`, first line only | `MAX_COMMITS = 30`, `MAX_COMMIT_SUBJECT_CHARS = 120` |
| `changed_paths` | `pr_files.path` | `MAX_CHANGED_PATHS = 80` |
| `linked_issue` | `GitHubClient.getIssue` (same repo) | `MAX_LINKED_ISSUES = 3`, `MAX_ISSUE_BODY_CHARS = 4000` |
| `linked_spec` | `GitHubClient.getFileContent(repo, path, headSha)` | `MAX_SPEC_FILES = 3` (linked + in-diff together, linked first), `MAX_SPEC_CHARS = 8000` |
| `spec_in_diff` | changed files matching `SPEC_PATH_PATTERNS`, fetched at head SHA | counts toward `MAX_SPEC_FILES` |
| `external_link` | URL from `TRACKER_HOSTS` or github.com of another repo | `MAX_EXTERNAL_LINKS = 5`, never fetched |

Total cap `MAX_TOTAL_SOURCE_CHARS = 30_000`. Sources over the cap, in
priority order (lowest priority first), get `skipped` / `limit_reached`.
Truncation is deterministic: head slice + `\n…[truncated N chars]`, status
`truncated`.

If `container.github()` throws (no PAT), every GitHub-backed source becomes
`unresolved` / `github_unavailable` and classification continues with what
remains.

## Confidence (deterministic, `computeConfidence` in `helpers.ts`)

`isSubstantiveBody(body, title)` strips HTML comments, heading lines,
checklist lines (`- [ ]` / `- [x]`) and link-only lines, then collapses
whitespace. `false` if the normalized text equals the title. Otherwise
`true` when `chars >= 60` and `words >= 8` (`MIN_BODY_CHARS`,
`MIN_BODY_WORDS`).

Rules, checked in order ("resolved" = status `used` or `truncated`):

1. resolved `linked_spec` → `high`, basis `linked_spec`
2. resolved `linked_issue` + substantive body → `high`, `issue_and_description`
3. substantive body → `medium`, `description_only`
4. resolved `linked_issue` → `medium`, `issue_only`
5. resolved `spec_in_diff` → `medium`, `spec_in_diff`
6. otherwise → `low`, `indirect_only`

The model can only **lower** the level: `ambiguity === 'unclear'` drops it
one level (low stays low), `downgraded = true` when the level actually
changed. The model never raises the level.

## Call sequence

`GET /pulls/:id/intent` returns the persisted row (or `null`) plus a
computed `stale` flag. `POST /pulls/:id/intent {force}` calls
`IntentService.derive`, which the reviews executor also calls once per
`executeRuns`, after loading the diff. On a hash hit (and no `force`) it
returns the cached row; on a miss it loads PR files/commits, fetches
`getIssue`/`getFileContent` (`Promise.allSettled`, so partial failures
don't fail the whole derive), classifies with the feature model, upserts
`pr_intent`, and returns the fresh record.

1. `input_hash = sha256(INTENT_PROMPT_VERSION + title + "\0" + (body ?? "") + "\0" + head_sha)`.
   The model is NOT part of the hash — changing it does not make the intent
   stale; Regenerate exists for that.
2. Single-flight: one in-flight `derive` promise per `prId`, shared by routes
   and the executor through the same `container.intent`.
3. Budgets: on-demand `timeoutMs 60_000`, `maxRetries 1`; review pre-work
   `timeoutMs 30_000`, `maxRetries 0`, plus an overall
   `withTimeout(…, INTENT_REVIEW_BUDGET_MS = 45_000)` in the executor.
4. Any failure on the review path: `runLog.info('Intent unavailable —
   reviewing without it: <msg>')` + `logger?.warn`. The review proceeds
   without intent; `failAll` is never called for this.

## Null-cost semantics

`pr_intent.cost_usd` is `NULL` when the provider didn't report a price —
never `0`. Same rule as `agent_runs.cost_usd` (root INSIGHTS 2026-09-19):
`NULL` must never be read as free.

## Reviewer prompt

`reviewer-core/src/prompt.ts` gains `PromptIntent` and `PromptParts.intent`.
When present, a `## PR intent (derived — <confidence> confidence)` section
renders right after `## PR description` and before `## Skills / rules`,
wrapped in `<untrusted source="derived-intent">`, capped at
`MAX_INTENT_BLOCK_CHARS = 2000` chars. Low confidence adds a "weak hint"
line. The section never lowers a finding's severity — the existing
`INJECTION_GUARD` already forbids descoping from untrusted content. When
`intent` is undefined, the prompt is byte-identical to the pre-intent
baseline.

## Acceptance criteria

- [ ] `GET /pulls/<seeded #482 id>/intent` on a fresh seed returns 200
      `{"intent":null}`.
- [ ] `POST /pulls/:id/intent {"force":false}` returns 200 with
      `intent.confidence ∈ {high, medium, low}`, a non-empty `intent.intent`,
      `sources` including `title` and `description`, and `cached:false`. A
      repeat without changes returns `cached:true` with no new LLM call.
- [ ] A body with `Closes #471` (issue exists) → source `linked_issue #471
      used`; a body with `[plan](docs/plans/x.md)` (file exists at head SHA)
      → `linked_spec used`, `confidence:'high'`, `confidence_basis:'linked_spec'`.
- [ ] A body with no substance and no links → `confidence:'low'`,
      `confidence_basis:'indirect_only'`.
- [ ] A link to `*.atlassian.net`, `linear.app` or `notion.so` → source
      `external_link` status `unresolved`; no outbound request to that host.
- [ ] The model comes from Settings: after `PUT /settings
      {feature_models:{review_intent:{provider:'openai', model:'gpt-4.1-mini'}}}`
      the POST response has `model:'gpt-4.1-mini'`. Without an override →
      `provider:'openrouter'`, `model:'deepseek/deepseek-v4-flash'`.
- [ ] After the PR's `head_sha` changes, `GET` returns `stale:true`.
- [ ] `POST /pulls/:id/review` with intent configured → the reviewer's user
      prompt contains `## PR intent (derived` inside
      `<untrusted source="derived-intent">`; the run's Live Log / trace has a
      line `Intent ready — …`; `prompt_assembly.intent` is not null.
- [ ] If intent cannot be derived (no provider key, or timeout), the review
      still completes `done`, and the log has `Intent unavailable —
      reviewing without it: …`.
- [ ] `pr_intent` stores `cost_usd` (NULL for unknown price, never 0),
      `tokens_in`, `tokens_out`, `model`, `provider`, `input_hash`,
      `head_sha`, `generated_at`.
- [ ] Overview shows the Intent card above Description in loading (skeleton),
      empty ("No intent yet" + "Generate intent"), error (alert), and ready
      (italic quote, IN SCOPE / OUT OF SCOPE, confidence badge, SOURCES,
      model · cost) states.

## Test plan

See ../../TESTING.md for suite conventions. This iteration ships the
implementation only; test files are written by test-writer from this spec
and the plan's per-work-package "Tests" lines — see the plan's handoff.

| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| reviewer-core | `npm run typecheck && npm test` | no | intent slot, placement, omission, cap, escaping, map-reduce |
| server | `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` | no | `intent-helpers.test.ts`, `contracts.test.ts`, `adapters.test.ts` |
| server | `pnpm exec vitest run .it.test` | yes (+ migration 0013) | `intent.it.test.ts`: routes, cache, force, stale, tenancy, degrade, review wiring |
| client | `pnpm typecheck && pnpm test` | no | `IntentCard.test.tsx`, `RunTraceDrawer.test.tsx` |
