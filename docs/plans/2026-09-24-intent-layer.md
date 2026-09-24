# Development Plan: Intent Layer (L03): derive PR intent and pass it into every review

Packages: server, reviewer-core, client, e2e (+ shared contracts) · Base: feat/lab3@b174fc0 · Spec: none yet. S0 creates `server/specs/05-intent-layer.md` and `client/specs/05-intent-layer.md`, and those become the acceptance source.
Status: **draft — awaiting answers to Open questions** (defaults marked).
External research notes: see "Research summary" at the end.

## Goal
When a review runs, DevDigest first works out why the PR exists: its intent, what is in scope, what is out of scope, the change type and a confidence level. It builds this from the PR title, body, linked GitHub issues and linked plan/spec documents. When none of those carry real information, it falls back to commits, branch name and changed paths, and the confidence is then forced to `low`. The intent comes from a separate cheap model selectable in Settings (`review_intent`). It is cached per PR (keyed by a hash of its inputs) and added to every agent's prompt as untrusted data. Findings the model marks as outside the intent get an `out_of_scope` flag. The flag never drops a finding and never lowers its severity, so a CRITICAL is always reported. The PR Overview gets an Intent card (confidence badge, sources, "inferred" hint, refresh button) and FindingCard gets an "Out of scope" badge.

## Out of scope
- Jira/Linear/other ticket systems. Keys like `ABC-123` are only listed as `skipped` sources.
- Following links found inside tickets or docs (one hop only), docs from other repos, and non-GitHub URLs (no arbitrary URL fetch).
- Excluding out-of-scope findings from the score, or hiding them by default.
- Smart Diff (the other half of L03), PR Brief card (L05), Plan Verifier (L06).
- Changing `INJECTION_GUARD`, `wrapUntrusted` or grounding semantics.

## Context used
- `server/INSIGHTS.md`: add-only columns in one `db:generate`; no `.default()` in response contracts and ISO timestamps; inject test per route; POST without body; `overrides.llm` for every provider id in tests; wait on the specific run id; grep `test/` for port fakes after changing a port; wire only in `composition.ts`; RunBus buffers shared pre-work; persist/cancel semantics.
- `reviewer-core/INSIGHTS.md`: the chosen model must be in `pricing.ts` (else `addCost` nulls cost); engine tests use `test/fixtures`; run `server/test/prompt-callers.test.ts` after touching prompt.ts.
- `client/INSIGHTS.md`: `renderWithProviders` + `mockFetch`; global mutation toast; `prReview.json` route-owned subkeys only; keys from `keys.ts`; `FEATURE_MODELS` stays in the zod-free constants file; never `borderColor` next to `borderLeftColor`; run client suite alone.
- `e2e/INSIGHTS.md`: uppercase labels → `innerText.toLowerCase()`; mock LLM stack; viewport 2000 on the PR page.
- Docs: `docs/review-flow.md` §3, `docs/agent-prompts/README.md`, `TESTING.md`, package `AGENTS.md` files.
- Mirrors `server/src/modules/conventions/` (system LLM feature, `settings.resolveFeatureModel`, `LlmConventionModel`, domain prompt with `wrapUntrusted`, array caps in code).

## Verified facts
- `FEATURE_MODELS.review_intent` = `openai/gpt-4.1` (`vendor/shared/constants/feature-models.ts`). Settings picker saves `provider:"openrouter"`; the `review_intent` row already renders.
- `pricing.ts` prices `deepseek/deepseek-v4-flash` (0.14/0.28), `gpt-4.1-mini` (0.4/1.6), `gpt-4o-mini`, `claude-haiku-4-5`.
- `pr_intent` = (pr_id PK, intent, in_scope, out_of_scope) (`db/schema/reviews.ts:92-98`), empty, never seeded; `ReviewRepository.upsertIntent/getIntent` are never called.
- `INJECTION_GUARD` already names "derived intent/scope" as untrusted (`reviewer-core/src/prompt.ts:16-28`).
- Executor shared pre-work uses a fan-out RunLogger (`run-executor.ts:73-84`); engine call at `:238-259`.
- `GitClient.readFile` reads the working tree, not the head sha; `fetchPullHead` is unused.
- `GitHubClient.getIssue` exists; `resolveLinkedIssue`'s regex matches any `#N` — do not reuse.
- Body stored only on `GET /pulls/:id`; `pr_commits` stored.
- Existing review integration tests inject only `openai`.

## Constraints & decisions
- **New module `modules/intent/`** (onion layout). Reviews reaches it only through an `IntentResolver` port wired in `reviews/composition.ts`.
- **Derive once per `POST /pulls/:id/review` as shared pre-work**, after the diff, before the agent loop; lines fan out to every run's log/trace.
- **Failure is non-fatal**: `info` event `warning: intent unavailable — …` (`data.warning='intent_unavailable'`), review runs without intent.
- **Budget 30 s** + AbortController that aborts only when all queued runs are cancelled.
- **Endpoints**: `GET /pulls/:id/intent`, `POST /pulls/:id/intent/refresh` (force, rate limited 10/min).
- **Cache**: one row per PR; hit when `stored.input_hash === sha256(canonicalJSON{prompt_version, provider, model, title, body, branch, head_sha, ticket_refs[], doc_paths[]})`. Key computed before I/O. Ticket bodies not in key → manual refresh. No stale fallback on failure. Single-flight per `prId:hash`.
- **Confidence set by code**: `derived_from='explicit'` when body is substantive (≥40 chars after stripping HTML comments/template headings) or ≥1 ticket/doc loaded; else `'inferred'` → `low`. Explicit → model value, capped at `medium` if a referenced doc/ticket failed or was skipped.
- **Out-of-scope policy (deterministic, reviewer-core `applyScopePolicy`)**: flag only when intent present (else `null`); never drop/downgrade; CRITICAL out-of-scope still counts as blocker and in score; WARNING/SUGGESTION kept + flagged; score formula unchanged.
- **reviewer-core stays pure**: `ReviewInput.intent?: Intent`; `## PR intent` = trusted `INTENT_SCOPE_RULE` + `wrapUntrusted('pr-intent', …)`; no intent → byte-identical prompt.
- **Cost attribution**: intent usage stored on `pr_intent` and in each run's `trace.intent`; not added to `agent_runs.cost_usd`.
- **Default model**: `openrouter` / `deepseek/deepseek-v4-flash`.
- **Kill switch**: `REVIEW_INTENT_ENABLED` (default on) in `platform/config.ts`; existing review it-tests set it `false`.
- **Docs read at PR head sha**: clone `GitClient.readFileAt` (`git cat-file -s` + `git show <sha>:<path>`, sha `^[0-9a-f]{7,40}$`), fallback `GitHubClient.getFileContent(ref=headSha)`. Same repo only; POSIX-normalized; reject absolute, `..`, backslash, NUL, leading `-`, `.git`; extensions `.md|.mdx|.markdown|.txt`; size checked before reading.
- **UI links built by the client** (`lib/github-urls.ts`) from `ref`, never from server-echoed URLs.

## Data sources
| Source | Where from / when | Trust | Limit (prompt) |
|---|---|---|---|
| Title | `pull_requests.title` | untrusted | 300 chars |
| Body | `pull_requests.body` (set by `GET /pulls/:id`) | untrusted | 6,000 chars, HTML comments stripped |
| Tickets | `#N`, `fixes #N`, `owner/repo#N` (same repo), `github.com/o/r/issues/N` in title, body, commits; `getIssue` on miss; self-refs/foreign skipped | untrusted | max 3; closing keywords first; 3,000 chars each |
| Docs (plan/spec) | Markdown links + bare paths in title/body; same-repo `github.com/o/r/(blob\|tree)/<ref>/<path>` read at head. Priority `docs/plans/**`, `**/specs/**`, `docs/**`, other `.md` | untrusted | max 5; 64 KiB fetched; 8,000 chars each; 20,000 total |
| Commits | `pr_commits` | untrusted | 30 × 200 chars |
| Branch | `pull_requests.branch` | untrusted | 120 chars |
| Changed files + stats | executor diff; refresh uses `pr_files` | derived | 100 paths |
| Diff excerpt | same, only when `inferred` | untrusted | 6,000 chars |

Each source → `Intent.sources[]` `{kind, ref, status: used|truncated|skipped|failed, detail}` built by the server.

## Call sequence
1. PR import unchanged.
2. `POST /pulls/:id/review` → `startReview` → `executeRuns` (fire-and-forget).
3. Executor: `Loading PR diff` → `resolveIntentPrework` → `IntentService.resolveForReview`: resolve feature model → parse links → compute key → read `pr_intent` → hit: log `PR intent ready (cached, confidence=…)`; miss: fetch tickets/docs, build prompt, `completeStructured(PrIntent)` (temp 0, maxRetries 1, 800 out tokens), clamp, cap confidence, upsert with usage, log sources/usage/cost. Any throw → warning, intent undefined.
4. Per agent: `reviewPullRequest({..., intent})` → prompt with `## PR intent` → grounding → `applyScopePolicy` → score.
5. Persist `findings.out_of_scope`; trace `prompt_assembly.intent` + `intent{status,…,cost}`.
6. UI refetches run-scoped queries (incl. intent) on SSE end; refresh endpoint re-derives on demand.

## Steps
### S0 — Specs [docs]
A `server/specs/05-intent-layer.md`, `client/specs/05-intent-layer.md` (format of `04-conventions.md`), linked to each other.

### S1 — Shared contracts [server + client vendor]
- `brief.ts`: `IntentConfidence`, `IntentDerivedFrom`, `IntentChangeType` (`feature|bugfix|refactor|docs|test|chore|security|perf|mixed`), `IntentSource`; `Intent` gains `change_type`, `confidence`, `derived_from`, `sources`.
- `review-api.ts`: `PrIntentRecord` + `head_sha, input_hash, prompt_version, provider, model, tokens_in, tokens_out, cost_usd, derived_at`; `PrIntentResponse = {intent: PrIntentRecord.nullable(), stale: boolean}`.
- `findings.ts`: `Finding.out_of_scope` nullish with `.describe()`.
- `trace.ts`: `PromptAssembly.intent`, `IntentTrace`, `RunTrace.intent` (nullish).
- `feature-models.ts`: `review_intent` → openrouter / deepseek/deepseek-v4-flash.
- Remove dead `upsertIntent/getIntent` from reviews repository.
- Copy to client vendor; tests in `server/test/contracts.test.ts`.
- Done when: drift check 0; server/client/reviewer-core typecheck + server unit pass.

### S2 — DB schema + migration [server]
- `prIntent` adds: `change_type`, `confidence`, `derived_from` (text NOT NULL + CHECK), `sources` jsonb, `head_sha`, `input_hash`, `prompt_version`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd numeric(12,6)`, `derived_at timestamptz`.
- `findings.out_of_scope` boolean NOT NULL default false; repo insert + mapper.
- `pnpm db:generate --name intent_layer` → `0015_intent_layer.sql` (adds only).
- Test: `schema-enums.test.ts`. Done when: migrate clean, typecheck/unit/`reviews.it` pass.

### S3 — Engine: intent section + scope policy [reviewer-core]
- `prompt.ts`: `PromptParts.intent`, `renderIntent`, `INTENT_SCOPE_RULE`, section after `## PR description`, `assembly.intent`.
- `review/run.ts`: `ReviewInput.intent`, `applyScopePolicy` after grounding, log line `scope: N out-of-scope finding(s) kept (C critical)`.
- Export from `index.ts`. Tests: prompt byte-identical without intent; rule outside `<untrusted>`; escape; CRITICAL out-of-scope kept + blocker + score; flag cleared without intent; map-reduce repeats section.
- Done when: reviewer-core typecheck/test/lint + `server/test/prompt-callers.test.ts` pass.

### S4 — Adapters [server]
- Ports: `FileAtRef`, `GitClient.readFileAt`, `GitHubClient.getFileContent`; simple-git + octokit implementations; mocks; mock LLM `PrIntent` fixture.
- Tests: adapters (tmp git repo), octokit getFileContent, mock provider. Done when: drift, typecheck, unit, arch:check pass.

### S5 — Intent module: domain [server]
- `modules/intent/domain/{constants,links,classification,intent}.ts` (limits, link extraction, zod classification schema, system prompt, user message with `wrapUntrusted` per source, substantive-body check, confidence cap, clamp, cache-key input).
- Test: `server/test/intent-domain.test.ts`.

### S6 — Intent module: application + infrastructure + wiring [server]
- `application/ports.ts`, `application/intent-service.ts` (resolveForReview/get/refresh, sha256, single-flight, NotFound), `infrastructure/{repository,mappers,llm-model,doc-source,ticket-source}.ts`, `composition.ts`, register in `modules/composition.ts`, `REVIEW_INTENT_ENABLED` in `platform/config.ts`. Never log content, only refs/counts.
- Test: `server/test/intent-service.test.ts` (miss/hit/force/fallback/oversize/LLM throw/concurrency/abort).

### S7 — HTTP routes [server]
- `modules/intent/http/{routes,schemas}.ts`; register in `modules/index.ts`.
- Test: `server/test/intent.it.test.ts` (overrides.llm for openai, anthropic, openrouter): null before derivation, refresh, stale after body edit, foreign workspace 404, missing key → config envelope.

### S8 — Reviews integration [server]
- `ReviewPull.branch`; `IntentResolver` port; `application/intent-prework.ts` (never throws); executor passes `intent` + `intentTrace`; `domain/trace.ts`; wire in `reviews/composition.ts`; existing review it-tests set `REVIEW_INTENT_ENABLED:'false'`.
- Tests: `reviews-service.test.ts` (success/throw/disabled/all-cancelled); `intent.it` end-to-end (derive, cache hit on 2nd run, CRITICAL out_of_scope persisted + blocker, trace fields).
- Manual: `LLM_PROVIDER_OVERRIDE=mock`, PR #482.

### S9 — Client data layer
- `prKeys.intent`, `RUN_SCOPED_PR_KEYS` += intent; `lib/hooks/intent.ts` (`usePrIntent`, `useRefreshIntent`); `invalidateRunScoped`; `githubIssueUrl`. Tests with `mockFetch`.

### S10 — Intent card on Overview
- `OverviewTab/_components/IntentCard/` (+ helpers, styles, tests); OverviewTab renders it and no longer returns null for empty body; PrDetailView passes `prId`, `repoFullName`, `headSha`; `messages/en/prReview.json` `intent.*`.
- UI: plain text intent, change_type chip, confidence badge, inferred hint, stale hint, scope lists, sources with status + client-built links, model/cost, Refresh, empty state "Derive now".

### S11 — Out-of-scope badge + trace block
- FindingCard badge (CRITICAL tooltip "Reported regardless of scope"); TraceBody `PromptBlock` for intent; i18n keys. Tests.

### S12 — e2e
- `e2e/flows/12-intent-mock.flow.json` (`requiresEnv: E2E_MOCK_LLM`).

### S13 — Docs
- `docs/review-flow.md`, `docs/agent-prompts/README.md`, `server/README.md`, `reviewer-core/README.md`.

## Verification plan
| Order | Package | Command |
|---|---|---|
| 1 | root | `./scripts/check-shared-drift.sh` |
| 2 | reviewer-core | `npm run typecheck && npm test && npm run lint` |
| 3 | server | `pnpm typecheck && pnpm lint && pnpm arch:check` |
| 4 | server | `pnpm test:unit` then `npx vitest run test/prompt-callers.test.ts` |
| 5 | server | `pnpm db:migrate && pnpm test:integration` |
| 6 | client | `pnpm typecheck && pnpm lint && pnpm test` (alone) |
| 7 | e2e | `./scripts/e2e.sh` |
| 8 | manual | `LLM_PROVIDER_OVERRIDE=mock ./scripts/dev.sh`, review PR #482 twice |

## Risks
- Prompt injection via body/ticket/spec → wrap every source, strict schema + clamp, re-wrap as `pr-intent`, trusted rule + INJECTION_GUARD, `applyScopePolicy` cannot drop/downgrade.
- Wrong intent biases reviewers → "review the entire diff", stated confidence, kill switch, later L06 eval.
- Stale cache → key covers body/title/branch/head/model/version; tickets via refresh + `stale` flag; body refreshes only on `GET /pulls/:id`.
- Latency → one cheap call per miss, 30 s cap, abortable.
- Cost → ~$0.002 per miss; stored separately; unpriced model nulls intent cost only.
- GitHub rate limits → ≤3 issue + ≤5 content calls per miss, clone first.
- Private/foreign links → same repo only, no SSRF.
- Large/binary docs → size checks before reading, NUL skip, caps.
- Real-key spend in tests → kill switch in old it-tests, all 3 providers injected in new ones.
- Contract drift / old rows → nullish/defaulted fields, drift check in CI.

## Open questions (defaults planned)
1. Default intent model: **A) openrouter/deepseek-v4-flash** · B) openai/gpt-4.1-mini.
2. Who pays for the intent call: **A) pr_intent + trace only** · B) also first run's cost.
3. Non-critical out-of-scope findings: **A) kept, flagged, score unchanged** · B) hide SUGGESTIONs by default · C) exclude from score.
4. Low-confidence intent in reviewer prompts: **A) yes, labelled, stricter rule** · B) UI only.
5. Tickets: **A) same-repo GitHub issues only** · B) Jira/Linear now.

## Research summary (external, 2026-09-24)
- CodeRabbit and Qodo Merge inject linked-issue context (GitHub `#N`/`Fixes #N`, Jira, Linear) into review; Qodo has Fully/Partially/Not Compliant ticket labels. PR-Agent `/describe` also consumes branch name and commit messages.
- No vendor publicly documents empty-description fallback or out-of-scope-critical handling — our rules are our own design.
- Linked issues: GraphQL `closingIssuesReferences` is the only first-class API (no REST). Plan uses text parsing + `getIssue`; `closingIssuesReferences` is a possible later addition.
- Contents API `GET /repos/{o}/{r}/contents/{path}?ref=` reads at a ref; REST 5,000 req/h authenticated.
- Cache key practice: hash of everything that determines the output; head sha alone is insufficient.
- Cheap models already priced in `pricing.ts`: `gpt-4.1-mini`, `gpt-4o-mini`, `claude-haiku-4-5`, `deepseek/deepseek-v4-flash`.
