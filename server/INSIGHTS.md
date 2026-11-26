# Insights

Lessons learned in this package: traps, non-obvious behaviour, approaches that
failed and why. Read before changing non-trivial code here. Maintained by the
`engineering-insights` skill (`.claude/skills/engineering-insights/SKILL.md`).
Append-only: newest at the bottom of each section. Corrections go in as
`> **Superseded YYYY-MM-DD:** …`, never as deletions.

Entry format (Session Notes and Open Questions are `- YYYY-MM-DD — …` one-liners):

```
### YYYY-MM-DD — short imperative title
**Insight:** symptom + root cause — what is non-obvious
**Rule:** ALWAYS/NEVER <action> — because <reason>
**Evidence:** path/to/file.ts → symbolName() | test name | command
```

Only add an entry if it is non-obvious from reading the code, specific, and
actionable cold.

---

## What Works

## What Doesn't Work

### 2026-11-25 — Persisting a review and its findings as two inserts
**Insight:** `run-executor` wrote `reviews` then `findings` separately, so a failed findings insert left a review with zero findings that the UI shows as a clean run.
**Rule:** ALWAYS persist a review through `ReviewRepository.insertReviewWithFindings` (one `db.transaction`) — because the two rows are one aggregate and must commit together.
**Evidence:** `src/modules/reviews/repository/review.repo.ts` → `insertReviewWithFindings` | test `review-persist-atomic.it.test.ts` (rollback case)

### 2026-11-26 — Colocating DB-backed tests under src/
**Insight:** `server/tsconfig.json` compiles `src/**/*.ts` with no `rootDir`; a `src/**/*.test.ts` importing `test/helpers/pg.ts` shifts the inferred root so output lands in `dist/src/…` and `node dist/server.js` breaks.
**Rule:** NEVER put tests that import from `server/test/` under `src/` — because it silently moves the build output; put them in `server/test/`.
**Evidence:** `server/test/skills.it.test.ts`, `server/test/run-executor-skills.test.ts`

### 2026-11-26 — Storing scan meta only on the rows a scan kept
**Insight:** Conventions keep scan meta in each row's `details.scan`; a scan that keeps nothing writes no row, so answering with `latestScan(rows)` returned null (first scan → empty state again) or an older scan's time/SHA. The tech-lead review caught it; both tests had mocked a page that already had scan meta.
**Rule:** ALWAYS return the scan's own meta object in the scan reply (`scan: scanMeta`) and test a FIRST scan with zero candidates — because derived meta lags whenever nothing is stored.
**Evidence:** `server/src/modules/conventions/service.ts` → `scan()` | test `conventions.it.test.ts` "a FIRST scan that keeps nothing still answers with this scan's meta"

## Codebase Patterns

### 2026-11-21 — [REVIEW NEEDED] Run cost is computed per LLM call but never persisted
**Insight:** reviewer-core returns `costUsd` per run, but `run-executor.ts` keeps only tokensIn/tokensOut and `agent_runs` has no cost column; the static fallback price table has no current Claude model IDs, so `estimateCost()` returns null for them.
**Rule:** ALWAYS derive run cost from `agent_runs.model` + tokens via `container.priceBook.estimate()` and refresh `adapters/llm/pricing.ts` when agents switch models — because unknown models silently price as null/$0.
**Evidence:** `server/src/modules/reviews/run-executor.ts` → `completeAgentRun()` call; `server/src/adapters/llm/pricing.ts` → `PRICING`; spec `docs/specs/m1-run-cost/SPEC.md`
> **Superseded 2026-11-21:** M1 stores the engine's `costUsd` in `agent_runs.cost_usd` instead of re-pricing on read — see "Read run cost from agent_runs.cost_usd, never re-price".

### 2026-11-21 — Read run cost from agent_runs.cost_usd, never re-price
**Insight:** `reviewPullRequest()` already returns `costUsd` (OpenRouter: real `usage.cost`), and M1 persists it once in `agent_runs.cost_usd`; `run_traces.stats.cost_usd` is a copy that pre-M1 traces lack. `null` means unknown (pre-M1, unpriced model, failed/cancelled) and the UI shows "—", not $0.
**Rule:** ALWAYS take run cost from `agent_runs.cost_usd` (trace route merges it via `withRunCost()`, PR list via one `sum()` group-by) and pass explicit `costUsd: null` in every non-done `completeAgentRun()` — because re-pricing from tokens drifts with prices and treating null as 0 hides unpriced runs.
**Evidence:** `server/src/modules/reviews/repository/run.repo.ts` → `getRunTrace()`, `withRunCost()`; `server/src/modules/pulls/routes.ts` → `costByPr`; test `test/run-cost.it.test.ts`

### 2026-11-25 — Server contract changes are not mirrored into the client copy
**Insight:** The server copy of `vendor/shared` is the newer one (has `openrouter`, `AgentVersionConfig`, `AgentManifest`, `CommitFile`); the client copy was not updated, and nothing in CI compares the two.
**Rule:** ALWAYS mirror a `server/src/vendor/shared` change into `client/src/vendor/shared` in the same PR — because no check catches the drift (see client/INSIGHTS.md "Client contract copy lacks openrouter").
**Evidence:** `diff -rq server/src/vendor/shared client/src/vendor/shared` (5 files differ on 2026-11-25)

### 2026-11-26 — Check skill ownership before writing agent_skills
**Insight:** `AgentsService.setSkills()` / `linkSkill()` verify only that the agent is in the workspace. Skill ids are inserted unchecked, so another workspace's skill can be linked. `AgentsRepository.setSkills()` also deletes and then inserts without a transaction.
**Rule:** ALWAYS check that every skill id belongs to the agent's workspace (400 otherwise) and wrap the delete+insert in one transaction — because the FK passes for any existing skill and a failed insert leaves the agent with no skills.
**Evidence:** `server/src/modules/agents/service.ts` → `setSkills()`, `linkSkill()`; `repository.ts` → `setSkills()`; spec `docs/specs/m2-skills/SPEC.md` §3 "Workspace isolation"

### 2026-11-26 — Bump the agent version when its skill links change
**Insight:** `agent_versions.config_json.skills` holds the ordered skill ids at snapshot time, but `setSkills()` never bumps `agents.version`, so after a relink the latest snapshot lies about which skills the agent uses.
**Rule:** ALWAYS bump the agent version and call `snapshotVersion()` after changing `agent_skills` — because eval replays and the version history read skills from the snapshot, not the live link table.
**Evidence:** `server/src/modules/agents/repository.ts` → `snapshotVersion()`, `setSkills()`; contract `AgentVersionConfig.skills`

### 2026-11-26 — Skill plumbing exists end to end except the run executor
**Insight:** `skills`, `skill_versions`, `agent_skills` tables, `Skill`/`AgentSkillLink` contracts, `/agents/:id/skills` routes and reviewer-core's `skills` prompt slot already exist, but `RunExecutor` never passes `skills` to `reviewPullRequest()`, so linked skills have no effect on reviews.
**Rule:** ALWAYS wire new skill work into `run-executor.ts` (load enabled links ordered by `agent_skills.order`) instead of adding a second prompt path — because the engine already renders `## Skills / rules` and omits it when empty.
**Evidence:** `server/src/modules/reviews/run-executor.ts` → `reviewPullRequest({...})` call; `reviewer-core/src/prompt.ts` → `assemblePrompt()`
> **Superseded 2026-11-26:** M2 wired it: the executor loads enabled skills via `PromptSkillsSource.loadPromptSkills()` (`reviews/ports.ts`) and logs `Skills: name@vN`.

### 2026-11-26 — Runs do not record which skills were in the prompt
**Insight:** `agent_runs` and `findings` carry `agent_id` but no skill reference, and the only trace of loaded skills is free text in `run_traces.trace.prompt_assembly.skills`. Per-skill metrics (pull frequency, skill accept rate, findings by category) therefore cannot be derived from existing data; joining through the current `agent_skills` gives wrong numbers for runs made before a relink.
**Rule:** NEVER compute skill-level stats via today's `agent_skills` links — because they do not reflect past runs; show agent-level numbers labelled as the agent's, or add a run→skill table first (M2 decided: no new table).
**Evidence:** `server/src/db/schema/runs.ts` → `agentRuns`; `docs/specs/m2-skills/SPEC.md` §3.4

### 2026-11-26 — Use a bare AppError for 400; ValidationError is 422
**Insight:** `platform/errors.ts` `ValidationError` maps to 422 and the global Zod handler also answers 422; there is no 400 or 409 class. Spec "400"s for body validation therefore come out as 422.
**Rule:** ALWAYS throw `new AppError(code, msg)` (default 400) for a semantic 400 and a local `AppError(..., 409)` for conflicts — because the named classes don't carry those statuses.
**Evidence:** `server/src/modules/agents/service.ts` → `assertWorkspaceSkills()` | `server/src/modules/skills/errors.ts` → `ConflictError`

### 2026-11-26 — Sort agent_skills by order then skill_id
**Insight:** `agent_skills.order` is not unique (`linkSkill` can create ties), so ordering by `order` alone makes prompt order and `agent_versions.config.skills` nondeterministic.
**Rule:** ALWAYS order links by `order, skill_id` and bump the agent version inside the relink transaction comparing (id, order) before/after — because ids alone miss order-only changes and a post-write re-read races.
**Evidence:** `server/src/modules/agents/repository.ts` → `relink()` | `server/src/modules/reviews/repository/skill.repo.ts` | test `agents-skills.it.test.ts`

### 2026-11-26 — Conventions state lives in accepted + rejected_at + details jsonb
**Insight:** The user required minimal schema change, so migration 0012 only ADDs `conventions.details` (jsonb: evidence[] with lines, category, bad_example, scan meta, skill_ids) and `rejected_at`; there is no status column and no scans/convention_skills table. pending = `!accepted && rejected_at IS NULL`; the scan header and the "in skill" badge are derived from `details`.
**Rule:** ALWAYS derive status via `deriveStatus()` and read/write `details` only through `ConventionsRepository` (Zod-parsed, tolerant) — because a new column or table was explicitly rejected and `evidence_path`/`evidence_snippet` must keep mirroring `details.evidence[0]` for older readers.
**Evidence:** `server/src/modules/conventions/repository.ts` → `parseDetails()`, `detailColumns()`, `replacePending()` | `helpers.ts` → `deriveStatus()`, `latestScan()` | migration `0012_thick_blackheart.sql`

### 2026-11-26 — Conventions scan has no unindexed fallback by decision
**Insight:** Walking the clone when repo-intel has no rank would need `walkClone` from `repo-intel/pipeline` (forbidden: repo-intel is read only through its facade) or a new facade method; the user chose neither.
**Rule:** NEVER add a clone-walk fallback to `ConventionsService.scan()` without asking — because the agreed behaviour is 422 "Repo is not indexed yet" when `getConventionSamples()` returns [].
**Evidence:** `server/src/modules/conventions/service.ts` → `scan()` | test `conventions.it.test.ts` "422s when the repo is not cloned, then when it is not indexed"

### 2026-11-26 — [REVIEW NEEDED] The conventions feature model defaults to an OpenAI model
**Insight:** `FEATURE_MODELS.conventions` defaults to `openai / gpt-5.4`; a workspace with only an OpenRouter key (the local dev setup on 2026-11-26) fails every scan in `container.llm('openai')` until Settings → Feature Models → Conventions is switched to an OpenRouter model.
**Rule:** ALWAYS check `/settings/secrets-status` and the `conventions` feature model before testing a live scan — because the failure is a config error, not a bug in the extractor.
**Evidence:** `server/src/vendor/shared/contracts/platform.ts` → `FEATURE_MODELS` | `server/src/modules/conventions/routes.ts` → `model.resolve`
> **Update 2026-11-26:** the user asked for no hard failure: conventions now resolve through `pickAvailableLLM()` (`settings/feature-models.ts`), falling back OpenRouter → OpenAI → Anthropic on a missing key; only when none has a key does the scan fail. Test `feature-model-fallback.test.ts`.

### 2026-11-26 — Fall back across LLM providers on ConfigError only
**Insight:** `container.llm(provider)` throws `ConfigError` (HTTP 500) when that provider's key is missing, and that is the only signal of "no key"; network/auth errors are different classes. A system feature can therefore try providers in order by catching just `ConfigError`.
**Rule:** ALWAYS resolve a system feature's LLM via `pickAvailableLLM(resolveFeatureModel(...), p => container.llm(p))` and keep each provider's fallback model in `FALLBACK_FEATURE_MODELS` — because swallowing other errors would hide real outages, and a provider switch needs its own model id (an OpenAI id is not valid on OpenRouter).
**Evidence:** `server/src/modules/settings/feature-models.ts` → `pickAvailableLLM()`, `FALLBACK_FEATURE_MODELS` | `server/src/platform/container.ts` → `buildLlm()` | test `feature-model-fallback.test.ts`

### 2026-11-26 — Wrap repo content in non-review LLM prompts yourself
**Insight:** `INJECTION_GUARD` is private to `reviewer-core/src/prompt.ts` (and must not be touched), so features outside the review engine get no guard unless they add one; only `wrapUntrusted` is re-exported via `platform/prompt.ts`. Skill bodies also reach the review prompt UNwrapped, so repo code inside them needs a fence longer than any backtick run.
**Rule:** ALWAYS wrap repo content with `wrapUntrusted()` plus a feature-local guard (e.g. `EXTRACTION_INJECTION_GUARD`) and fence skill-body code with `codeFence()` — because sampled files include AGENTS.md/CONTRIBUTING.md and a stray ``` would turn code into reviewer instructions.
**Evidence:** `server/src/modules/conventions/prompt.ts` → `EXTRACTION_INJECTION_GUARD`, `buildExtractionUserPrompt()` | `helpers.ts` → `codeFence()`, `ruleBlock()`

## Tool & Library Notes

### 2026-11-25 — Keep dependency-cruiser rule regexes flat and unanchored for pnpm
**Insight:** depcruise refuses the whole config with "has an unsafe regular expression. Bailing out." when a `to.path` holds nested quantifiers like `(\.pnpm/[^/]+/node_modules/)?`; under pnpm, packages resolve to `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`, so `^node_modules/drizzle-orm` never matches.
**Rule:** ALWAYS match packages as unanchored `node_modules/(drizzle-orm|openai|…)/` and set `tsPreCompilationDeps: true` to see `import type` edges (exempt with `dependencyTypesNot: ['type-only']`) — because anchored patterns silently pass every import and nested groups abort the run.
**Evidence:** `.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs` → `pkg()`; `./node_modules/.bin/depcruise src --config <template> --output-type err`

### 2026-11-25 — A response schema with .default() rewrites the reply
**Insight:** `fastify-type-provider-zod`'s serializer parses the handler result with the response schema, so `schema.response[200]: Settings` would inject every `.default()` (theme, density…) into `GET /settings` and 500 on a stored value that no longer validates.
**Rule:** ALWAYS add a response schema only when the contract matches the returned shape exactly (no `.default()`/transforms), e.g. `SecretsStatus`, `ConnTestResult` — because otherwise the schema silently changes the API output.
**Evidence:** `src/modules/settings/routes.ts` → `/settings/secrets-status`, `/settings/test-connection` | `@devdigest/shared` → `SettingsKnown`

### 2026-11-26 — Detect unique violations through the Drizzle error cause chain
**Insight:** Drizzle 0.45 wraps driver errors in `DrizzleQueryError`; the postgres-js error with `code === '23505'` sits on `.cause`, so a top-level `err.code` check never sees the conflict and the route returns 500 instead of 409.
**Rule:** ALWAYS walk `err.cause` when mapping pg error codes — because the wrapper hides `code` on the outer error.
**Evidence:** `server/src/modules/skills/helpers.ts` → `isUniqueViolation()` | test `skills.it.test.ts` duplicate name → 409

### 2026-11-26 — [REVIEW NEEDED] zod 3 .partial() suppresses .default()
**Insight:** `CreateSkillInput.partial()` wraps defaulted fields in `ZodOptional`, so a missing key stays `undefined` and `PUT {}` does not reset description/type to defaults — the desired behaviour for patches, but it may change under zod 4.
**Rule:** ALWAYS keep the it-test asserting `PUT {}` leaves fields untouched when upgrading zod — because patch semantics depend on this zod 3 behaviour.
**Evidence:** `server/src/vendor/shared/contracts/knowledge.ts` → `UpdateSkillInput` | test `skills.it.test.ts`

## Recurring Errors & Fixes

## Session Notes

- 2026-11-21 — M1 run cost (server: column + 4 read paths): done, unit + integration green; see "Read run cost from agent_runs.cost_usd, never re-price"

- 2026-11-25 — onion-architecture skill (rules only, enforcement not wired): template run on server/src reports 34 errors + 5 cycles as starting baseline; see "Keep dependency-cruiser rule regexes flat and unanchored for pnpm"

- 2026-11-26 — M2 Skills spec + plan written (docs/specs/m2-skills), no code; see "Skill plumbing exists end to end except the run executor"

- 2026-11-26 — M2 Skills server (migration 0011, skills module + stats, agent link checks, executor skills, seed): 262 tests green; see "Sort agent_skills by order then skill_id"

- 2026-11-26 — Conventions Extractor stage 1 server (migration 0012, conventions module scan/triage/draft/create, skills insert source+evidence_files, container.skillsRepo): 290 tests green; see "Conventions state lives in accepted + rejected_at + details jsonb"

## Open Questions

- 2026-11-25 — The onion template rule `routes-no-data-access` flags `new XRepository(container.db)` wiring in `routes.ts`, which onion-architecture §6 prescribes as the module composition root — change the rule or move wiring to a dedicated file? Blocks wiring depcruise into CI (context: `.claude/skills/onion-architecture/templates/dependency-cruiser.example.cjs` → `routes-no-data-access`; `src/modules/settings/routes.ts`)
