# Spec: PR Brief
Spec ID: SPEC-03
Status: implemented
Supersedes: —

## Problem and user

A reviewer who opens a pull request in DevDigest sees the Intent card and the Blast Radius card on the Overview tab, and nothing that answers the first questions: should this merge, what is risky, and where do I look first. The verdict, score and findings live on other tabs and only exist after a review run. Today the Overview "PR BRIEF" is only a section label over two cards. The repo already holds pieces that nothing uses: a composed `PrBrief` contract (`server/src/vendor/shared/contracts/brief.ts`), an empty `pr_brief` table (`server/src/db/schema/reviews.ts`) and a `risk_brief` feature model (`FEATURE_MODELS` in `contracts/platform.ts`).

Users: the **reviewer** and the **repo owner** who open a PR and want a one-screen read before opening the diff. They notice the gap today when they have to open Agent runs and Files changed to learn what the review concluded and which lines matter.

## Goals / Non-goals

Goals:
- A PR Brief card at the top of the Overview tab: verdict, findings and blockers counts, a short summary, the PR score, and the model cost and tokens of the brief.
- Risk areas inside the Intent card and a full-width "Review focus — read these first" card, both written by the same single model call.
- Verdict, score and counts come from the latest review in code; the model never states them.
- The brief is stored per PR and shown instantly after a reload with no model call. Generate and Regenerate are the only actions that cost money.
- Generating a brief is exactly one model call, and that call is visible as a run with a trace and log lines.
- Every file reference is checked against the PR diff. A review-focus row or risk reference opens the Files changed tab at that file and line.
- The card says when the stored brief is out of date and keeps the previous brief while a new one is written or after a failure.

Non-goals (each is something a user could reasonably expect):
- No MCP tool for the brief.
- No automatic generation, for example after an import or after a review run. No automatic regeneration when the brief is stale.
- No cancel button for a brief run.
- No change to Intent derivation, Blast Radius computation, Smart Diff, or the review run itself. The brief never triggers intent derivation.
- No prior-PR history in the brief (it stays in the Blast Radius card).
- No new verdict logic: the brief does not recompute or override a review's verdict or score.
- No brief on the PR list, the timeline, or any page other than the PR Overview tab.
- No editing of the brief text by the user.
- No per-brief model picker on the card: the model is the workspace's "PR Brief" feature model in Settings.

## User stories

- US-1 · As a reviewer, I want a brief at the top of the PR Overview, so that I know the verdict and the main concerns before opening the diff.
- US-2 · As a reviewer, I want to generate the brief on demand, so that I pay for a model call only when I want one.
- US-3 · As a reviewer, I want the brief to be there after a page refresh without a new generation, so that I never pay twice for the same answer.
- US-4 · As a repo owner, I want to see which model wrote the brief, what it cost, and the trace of the single call, so that I can audit and control spend.
- US-5 · As a reviewer, I want risk areas and a read-first list that point at real lines, so that I can act on them without checking them.
- US-6 · As a reviewer, I want a click on a file and line to take me to it in Files changed, so that I do not hunt for it.
- US-7 · As a reviewer, I want to know when the brief no longer matches the PR or the latest review, and to keep reading the old brief while a new one is written, so that regeneration never leaves me with nothing.

## Acceptance criteria (EARS)

Placement and layout

- AC-1 (US-1) · The system shall render on the Overview tab (`/repos/[repoId]/pulls/[number]`, query `tab` absent or `overview`), inside the existing "PR BRIEF" section, the PR Brief card first, then the Intent and Blast Radius cards in their existing two-column grid, then the "Review focus" card full-width below the grid.
- AC-2 (US-5) · The system shall render the "Risk areas" sub-section inside the Intent card, below the in-scope / out-of-scope lists, and shall render no "Risk areas" heading when the brief has no risks or no stored brief exists.
- AC-3 (US-1) · The system shall leave the Intent card, the Blast Radius card and the PR description section unchanged when no brief exists.

Card states and actions

- AC-4 (US-2) · WHILE no stored brief exists and no brief run is running, the PR Brief card shall show a "Generate brief" button whose tooltip names the feature model as `<provider>/<model>`.
- AC-5 (US-2) · WHEN the user clicks "Generate brief" or the regenerate icon, the system shall call `POST /pulls/:id/brief/generate` **(new)**.
- AC-6 (US-7) · WHILE a brief run is running, the system shall show a spinner on the Generate button or regenerate icon, disable it, keep showing the previous brief if one exists, and poll `GET /pulls/:id/brief` **(new)** until the run ends.
- AC-7 (US-1) · WHILE a stored brief exists, the card shall show: the verdict icon tile and label, a badge "`N` findings · `M` blockers", an info (i) icon, the summary paragraph, the regenerate icon with the model in its tooltip, the PR SCORE ring, and the cost and tokens line.
- AC-8 (US-7) · IF the latest brief run ended `failed`, THEN the card shall show the previous brief (or the Generate state when none) and an inline error with the run's `error` text, and the failure shall not also raise a toast.
- AC-9 (US-1) · WHILE the brief view is loading, the card shall show a skeleton; IF `GET /pulls/:id/brief` fails, THEN the card shall show an inline error with Retry and the other Overview cards shall still render.

Deterministic review facts

- AC-10 (US-1) · The system shall take verdict, score, findings count and blockers count from the newest review with `kind = review` across all agents of the PR, computed at read time and never produced by the model.
- AC-11 (US-1) · The system shall count findings as the non-dismissed findings of that review and blockers as those with severity `CRITICAL`.
- AC-12 (US-1) · The system shall show verdict label and tile colour from the existing verdict mapping (`request_changes`, `approve`, `comment`) used by `VerdictBanner`.
- AC-13 (US-1) · WHEN the user hovers or focuses the (i) icon, the system shall show the agent name and the time of the review the verdict comes from, and that summary and focus were written by the brief model.
- AC-14 (US-1) · WHILE the PR has no review with `kind = review`, the card shall show a neutral "Not reviewed yet" tile, no PR SCORE ring, no findings badge, and a hint to run a review; the summary, risk areas and review focus shall still show when a brief exists.
- AC-15 (US-1) · WHEN a review finishes or a finding is dismissed or accepted, the card's verdict, counts and score shall reflect it after the brief query refetches, without regenerating the brief.

Cost and trace

- AC-16 (US-4) · The system shall show the cost and tokens line as `formatCost(cost_usd)` and `<tokens_in>→<tokens_out>` of the brief's own model call, with "—" when `cost_usd` is null, and shall not add review costs to it.
- AC-17 (US-4) · WHEN the user clicks the cost and tokens line, the system shall open the existing `RunTraceDrawer` for the brief run by setting the `trace` query param to the run id.
- AC-18 (US-4) · The system shall record every brief generation as an `agent_runs` row **(new column `kind`, value `brief`; existing rows read as `review`)** with `agent_id` null, `pr_id`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (price book, null when unpriced), `duration_ms`, `status` and `error`.
- AC-19 (US-4) · The system shall persist a `run_traces` document for each brief run containing the prompt as sent, the raw model output, and log lines that state the input counts and caps applied, the single model call with `provider/model`, tokens, cost and duration, and the number of references dropped by verification.
- AC-20 (US-4) · The system shall send log lines for a brief run through `RunLogger` so that they reach the run's SSE stream, the persisted trace and the server's structured logger.
- AC-21 (US-4) · The system shall make exactly one model call per brief run, meaning one structured call with no reprompt (`maxRetries: 0`) and no intent derivation; a transport-level retry of the same request after a 429 or 5xx response (adapter default) is not a second call. The persisted trace shall list exactly one `generate_brief` tool call.
- AC-22 (US-4) · The system shall not call a model on `GET /pulls/:id/brief`, on page load, on Intent derivation, or on any other action than `POST /pulls/:id/brief/generate`.
- AC-23 (US-4) · The system shall exclude `kind = brief` runs from agent statistics, from `GET /pulls/:id/runs/active`, from the Findings-tab live run UI and from the review accordions of the Run history, and shall include their cost in the PR list cost rollup.

Generation

- AC-24 (US-2) · The system shall answer `POST /pulls/:id/brief/generate` with 202 and the run (`status: running`) and do the work in a background job.
- AC-25 (US-2) · The system shall allow at most one running brief run per PR. IF a run is running and younger than the stale limit, THEN the system shall return it as is. IF it is older than the stale limit, THEN the system shall mark it failed as abandoned and start a new one.
- AC-26 (US-2) · The system shall limit `POST /pulls/:id/brief/generate` with a per-route rate limit of 6 requests per minute.
- AC-27 (US-4) · The system shall use the workspace's `risk_brief` feature model, resolved through `container.featureModel(workspaceId, 'risk_brief')`.
- AC-28 (US-4) · The system shall change the built-in default of `risk_brief` in `FEATURE_MODELS` to `openrouter` / `deepseek/deepseek-v4-flash`, relabel it "PR Brief", and update its description to say it writes the PR brief (summary, risks, review focus); a workspace override already stored shall keep winning.
- AC-29 (US-1) · The system shall choose the model inputs in code with no model call: PR title, branch and body; the changed files with patches in Smart Diff role order (core first, boilerplate last); the non-dismissed findings of the newest review; the stored intent when one exists (never derived); and the blast summary with its top changed symbols and callers when the repo index is usable.
- AC-30 (US-1) · The system shall cap the inputs with constants: at most 6 000 characters of patch per file and 60 000 in total, files over the total named only, at most 30 findings (title, severity, `file:line`, first 200 characters of rationale), at most 10 symbols with 5 callers each.
- AC-31 (US-7) · WHEN a run finishes with `status: done`, the system shall replace the stored brief and its metadata in one transaction; WHEN it finishes `failed`, the system shall leave the stored brief unchanged.
- AC-32 (US-4) · IF the model output does not match the `PrBriefDraft` contract, THEN the run shall end `failed` with an error saying the model returned an invalid brief, and no second call shall be made.
- AC-33 (US-4) · IF no API key exists for the feature model's provider, THEN the run shall end `failed` with an error that names the provider.
- AC-34 (US-1) · The system shall store `summary` of at most 400 characters, 3 to 5 risks and at most 6 review-focus items, trimming longer model output in code.
- AC-35 (US-1) · WHERE the repo index is degraded or `REPO_INTEL_ENABLED` is off, the system shall still generate the brief without the blast input.

Verification of references

- AC-36 (US-5) · The system shall drop every review-focus item and every risk whose `path` is not a changed file of the PR.
- AC-37 (US-5) · IF a line, or the whole of a line range, is outside the new-side hunks of its file's patch, THEN the system shall keep the item without the line; IF a range partly intersects a hunk, THEN the system shall clip it to the hunks.
- AC-38 (US-5) · The system shall store each review-focus item as `{ path, line (nullable), reason }` and each risk reference as `path`, `path:line` or `path:start-end`, all verified by AC-36 and AC-37.
- AC-39 (US-5) · IF no risk survives verification, THEN the stored brief shall hold an empty risk list and the Intent card shall show no "Risk areas" section; IF no review-focus item survives, THEN the "Review focus" card shall show an explicit empty note, and the system shall not add an item the model did not return.

Risk areas and review focus

- AC-40 (US-5) · The system shall show each risk as a chip with a kind icon, the title, the monospace reference, and an expand chevron; WHEN the user expands it, the chip shall show the `explanation` and the severity from the severity tokens.
- AC-41 (US-5) · The system shall restrict `Risk.kind` to the closed set `auth`, `dependency`, `performance`, `data`, `api_change`, `config`, `other`, and shall show a generic icon for any other stored value.
- AC-42 (US-5) · The system shall show the "Review focus — read these first" card with a count badge and one row per item as `path:line — reason` (just `path — reason` when `line` is null), in the order the model returned.

Deep link to the diff

- AC-43 (US-6) · WHEN the user clicks a review-focus row or a risk reference with a path, the system shall navigate to the same PR with `tab=diff` and the query params `file=<path>` and `line=<n>` **(new)**; the `line` param is omitted when the reference has no line.
- AC-44 (US-6) · WHEN the Files changed tab opens with `file` set, the system shall expand that file's card and its role group, scroll the file into view, and, when `line` is set and rendered, scroll to that line and highlight it briefly.
- AC-45 (US-6) · IF the `file` param names no changed file, or the `line` is not rendered, THEN the tab shall open normally without an error and without a toast.
- AC-46 (US-6) · The system shall keep `file` and `line` in the URL so a reload reopens the same place, and shall match `file` only against the PR's changed file paths.

Staleness and truncation

- AC-47 (US-7) · The system shall set `stale` true when the PR's current `head_sha` differs from the stored brief's `head_sha`, or when the newest review's id differs from the stored `source_review_id`. A changed feature model, a dismissed finding and an accepted finding shall not set it.
- AC-48 (US-7) · WHILE `stale` is true, the card shall show a "Out of date" badge with a hint explaining why, and the system shall not regenerate on its own.
- AC-49 (US-1) · WHERE `files_included` is less than `files_total`, the card shall show a note "Based on `X` of `Y` files".

Routes, contract and persistence

- AC-50 (US-3) · The system shall expose `GET /pulls/:id/brief` **(new)** returning a `PrBriefView` **(new)**: the stored brief or `null`, the newest `kind = review` review facts or `null`, the latest brief run or `null`, and `stale`. The route shall read from the database only: no model call and no git read.
- AC-51 (US-3) · WHEN the page is reloaded, the system shall show the stored brief from `GET /pulls/:id/brief` without any generation.
- AC-52 (US-1) · The system shall resolve both routes through `getContext()` and scope the PR to the workspace; an unknown PR shall give 404 in the standard error envelope.
- AC-53 (US-1) · The system shall replace the unused composed `PrBrief` in `server/src/vendor/shared/contracts/brief.ts` with `PrBriefDraft`, `PrBrief`, `PrBriefReview` and `PrBriefView` (field names below), keep `Intent`, `BlastRadius`, `Risks`, `PrHistory` and `SmartDiff` as they are apart from `Risk.kind`, and copy the file to `client/src/vendor/shared`.
- AC-54 (US-3) · The system shall extend the `pr_brief` table with the metadata columns `generated_at`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `head_sha`, `source_review_id`, `run_id`, `files_total`, `files_included`, add `agent_runs.kind`, through `pnpm db:generate`. Migrations shall not run on boot.
- AC-55 (US-3) · The system shall validate the stored `json` against the `PrBrief` contract on read; IF it does not validate, THEN the view shall return no brief and the card shall show the Generate state.
- AC-56 (US-1) · The system shall add all new strings under `client/messages/en/brief.json` as camelCase keys, with colours from CSS variables only, and every new control (Generate, regenerate, chip chevrons, focus rows, cost line, (i) icon) reachable and operable by keyboard with an accessible name.

Contract shape (new, field names only):
`PrBriefDraft { summary, risks: Risk[], review_focus: [{ path, line (nullable), reason }] }` (what the model returns);
`PrBrief { summary, risks, review_focus, generated_at, provider, model, tokens_in, tokens_out, cost_usd (nullable), head_sha, source_review_id (nullable), run_id, files_total, files_included }`;
`PrBriefReview { review_id, run_id, agent_name (nullable), verdict, score (nullable), findings_count, blockers, created_at }`;
`PrBriefView { brief: PrBrief | null, review: PrBriefReview | null, run: RunSummary | null, stale }`; `RunSummary` gains `kind`.
`Risk { kind (enum above), title, explanation, severity (high | medium | low), file_refs[] }`.

## Edge cases

| Case | What the user sees | Refines |
|---|---|---|
| PR never reviewed | Generate works; neutral "Not reviewed yet" tile, no ring, summary and focus from the diff | AC-14 |
| Review finishes while the brief is being written | The run keeps the review id it started with; the card shows "Out of date" afterwards | AC-47 |
| New commit pushed (head sha changes) | "Out of date" badge; the old brief stays | AC-47, AC-48 |
| Huge diff over the total cap | Brief written from the capped input; note "Based on X of Y files" | AC-30, AC-49 |
| PR with one tiny file | Fewer than 3 risks may survive; the card shows what survived, no filler | AC-34, AC-39 |
| Model returns a path not in the PR | The item is dropped silently | AC-36 |
| Model returns a line outside the hunks | Row shows the path without a line; click opens the file | AC-37, AC-43 |
| Two clicks on Regenerate, or two tabs | One run; the second request gets the running run | AC-25 |
| Run orphaned by a crash or hung provider | After the stale limit the next Generate fails it and starts a new run; boot also reaps `running` rows | AC-25 |
| Regenerate fails (provider error, invalid output, timeout) | Previous brief stays, inline error, button enabled again, no toast | AC-8, AC-31, AC-32 |
| No key for the feature model | Run fails with an error naming the provider | AC-33 |
| Repo index not built | Brief generated without blast input; blast card shows its own degraded state | AC-35 |
| Stored `json` in an old or invalid shape | Treated as no brief: Generate state | AC-55 |
| Secret value in the diff | The prompt forbids quoting secret values; summary and reason texts name the kind of secret only | Untrusted inputs |
| Model summary disagrees with the verdict | The verdict tile is the review's; the summary is shown as text only | AC-10 |
| Deep link to a file that is collapsed or in a collapsed group | File and group expand, line highlighted | AC-44 |
| Deep link to a file removed from the PR after a sync | Files changed opens normally, no error | AC-45 |
| PR deleted while a run is running | The `pr_brief` row cascades away; the `agent_runs` row survives with `pr_id` null (`ON DELETE SET NULL`) and is marked `failed`; the job ends silently with no further write and no error surfaced | AC-52 |
| Brief run shown in Run history or active runs | Never shown there as a review; reachable only from the card's cost line | AC-23 |
| Clipboard or tooltip unavailable | Not used; no clipboard action in this feature | — |
| Postgres unavailable | GET fails; inline error with Retry | AC-9 |

## Non-functional requirements

- One brief generation is exactly one model call (AC-21): one structured call with no reprompt (`maxRetries: 0`) and no intent derivation; a transport-level retry of the same request after a 429 or 5xx response is not a second call. Reading the brief makes no model call, no GitHub call and no git read (AC-50).
- Input per call is capped by the constants in AC-30; the caps are not user settings.
- Cost and tokens per generation are recorded on the run row and the stored brief and shown on the card; a null cost shows "—".
- Generation runs as a background job and never blocks the request; the stale-run limit is 10 minutes.
- The stored `pr_brief` row and the run row are written so that a view reading the run first and the brief second never sees a done run without its brief.
- Secrets only through `container.secrets`. Logs and run log lines carry counts, paths and ids, never diff text, finding text or model output; the trace holds the prompt and raw output as review traces already do.
- Mutation toast policy of `providers.tsx` applies to Generate; a failure shown in the inline error shall not also toast.
- Accessibility: all new controls keyboard operable with accessible names; the spinner state is announced through `aria-busy` or equivalent; colours from CSS variables and the `SEV` tokens only.
- Server work follows the onion rules: a new `modules/pr-brief/` with `routes.ts` · `service.ts` · `repository.ts` · `ports.ts`, explicit deps built in `routes.ts`, `pnpm lint:arch` with no new baseline entries; any prompt builder added to `reviewer-core` stays pure (no I/O).
- Latency: no target for generation (model-bound); `GET /pulls/:id/brief` answers from the database with one round of indexed reads.

## Inputs and provenance

| Input | Source | Provenance | Owner |
|---|---|---|---|
| PR title, branch, body, changed files and patches | `pull_requests`, `pr_files`, `PrDetail` | `[reused: GET /pulls/:id data]` | pulls module |
| Smart Diff role order of files | `modules/smart-diff` classifier | `[reused: smart-diff role classifier]` | smart-diff |
| Newest review, its findings, dismissal state | `reviews`, `findings` | `[reused: ReviewRecord, FindingRecord]` | reviews module |
| Verdict, score, findings and blockers counts | computed at read time from the newest review | `[deterministic: counts in code]` | pr-brief module **(new)** |
| Stored intent | `pr_intent` via `PrIntentRecord` | `[reused: IntentService data, never derived here]` | reviews module |
| Blast summary, symbols, callers | `BlastService` / repo index | `[reused: BlastRadius, no model]` | blast |
| Summary, risks (kind, title, explanation, severity, refs), review focus | exactly one model call on `risk_brief` (AC-21): one structured call, no reprompt, no intent derivation; a transport-level 429/5xx retry of the same request is not a second call | `[llm: risk_brief generate_brief]` | pr-brief module **(new)** |
| Verified paths and lines | check against changed files and new-side hunks | `[deterministic: verification]` | pr-brief module **(new)** |
| Feature model choice | Settings → Feature Models, `FEATURE_MODELS.risk_brief` | `[reused: featureModel, FEATURE_MODELS]` | settings |
| Tokens and cost | provider usage and the price book | `[reused: price book]` | platform |
| Stored brief, metadata, run row, trace | `pr_brief` (extended), `agent_runs` (`kind`), `run_traces` | `[new]` | pr-brief module **(new)** |
| `stale` | head sha and review id comparison | `[deterministic: comparison]` | pr-brief module **(new)** |
| Deep-link target | `tab`, `file`, `line` query params | `[new]` | client |
| Card layout, copy, states | the four design screenshots | `[new]` | design |
| Prompt | `server/src/prompts/` file for the brief | `[new]` | pr-brief module **(new)** |

## Untrusted inputs

| Input | Handling |
|---|---|
| PR title, body, branch, commit text | Sent only inside `<untrusted>` blocks; the prompt states they are data, never instructions. Capped. |
| Diff patches and file content | Same delimiter rule; capped per file and in total; the prompt forbids quoting secret values. |
| Findings text from earlier reviews (LLM output) | Treated as data inside `<untrusted>` blocks; capped. |
| Stored intent and blast names (derived from PR text and repo code) | Same: data, never instructions. |
| Model output (summary, titles, explanations, reasons, paths, lines, kinds) | Parsed against `PrBriefDraft`; paths and lines verified (AC-36, AC-37); counts trimmed (AC-34); rendered as plain text, never as HTML or Markdown; the model has no field for verdict or score. |
| Stored `json` read back from the database | Validated on read (AC-55); anything else is treated as no brief. |
| `file` and `line` query params | `file` matched only against the PR's changed file paths; `line` parsed as a positive integer; anything else is ignored (AC-45). |

## Open questions

No question is open for the user. The main session decided the following on 2026-10-21 for an autonomous run, and they are recorded as decisions:

- The brief is an `agent_runs` row with a new `kind` column, a `run_traces` document and RunLogger lines; excluded from agent stats, active runs and review accordions; included in the PR cost rollup; opened from the cost line (AC-17 to AC-23).
- Background job with 202 and polling, one running run per PR, one structured call with no reprompt, no intent derivation (AC-21, AC-24, AC-25).
- Model writes summary, risks and focus; code supplies verdict, score, counts, cost and tokens; blockers are CRITICAL non-dismissed findings of the newest `kind = review` run across agents (AC-10, AC-11).
- `pr_brief` extended, composed `PrBrief` replaced, `Risk.kind` closed, `risk_brief` relabelled "PR Brief" with default `openrouter` / `deepseek/deepseek-v4-flash` (AC-28, AC-41, AC-53, AC-54).
- Reference rules, deep link, no MCP tool, truncation note, no auto-generation, no cancel, inline error without a duplicate toast (AC-36 to AC-46, AC-49, AC-8).

Checks left to the `implementation-planner` (facts not read in this run, not user questions):
- Whether `RunTraceDrawer` renders a trace with no findings and a non-review `config.agent` cleanly, and what `config.agent` should read for a brief run.
- Which existing compact token formatter produces `8.2K→1.3K`, or whether one is added.
- How `RoleGroup` stores its open state, to expand it from the deep link.
- Which Run-history and agent-stats queries need the `kind` filter (AC-23), including the `Agent runs` tab count.
