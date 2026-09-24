# Context pack: Safe structured logging of prompt assembly
## INSIGHTS that apply
- [I1] `server/INSIGHTS.md:24` — "server/tsconfig.json include covers only src, and vitest does not typecheck, so a changed port signature breaks test fakes only at runtime" → port changes are optional/trailing only; grep test/ for fakes of ConventionModel.
- [I1b] `server/INSIGHTS.md:37` — "Container takes the app logger as an optional 4th ctor arg (buildApp passes app.log) … a bare new Container(config, db) in unit tests still falls back to console" → PromptLog must tolerate no logger / a `{warn}`-only logger (test/composition.test.ts:54).
- [I2] `server/INSIGHTS.md:52` — "z.coerce.boolean() … the STRING 'false' coerces to true … follow the existing REPO_INTEL_ENABLED pattern … z.string().optional() in the schema + an explicit comparison in loadConfig" → PROMPT_LOG_VERBOSE uses `=== 'true'`.
- [I3] `server/INSIGHTS.md:30` — intent resolveForReview is "a fan-in single-flight … one derive() per prId:hash" → intent correlation id = prId + hash prefix; derive logs once per flight.
- [I4] `server/INSIGHTS.md:43` — "module services and job handlers are built ONLY by the module's build<Name>Module(container) factory" → wire promptLog in composition.ts files.
- [I5] `reviewer-core/INSIGHTS.md:106` — "new engine tests must use these fixtures (StubLLM + pre-parsed configDiff/twoFileDiff)".
- [I6] `reviewer-core/INSIGHTS.md:107` — "'<\/untrusted>' is pinned by server/test/prompt-callers.test.ts, which reviewer-core's own suite never runs" → run it after S1/S2.
- [I7] `reviewer-core/INSIGHTS.md:104` — assembly.specs stores WRAPPED text, other slots RAW → `chars` measured on the string actually placed in the message, not on `assembly.*`.
## Verified facts
- [F1] `reviewer-core/src/prompt.ts:140-201` — assemblePrompt builds system = agent prompt + INJECTION_GUARD, user = task, pr_description (cut at 4000 chars), intent (INTENT_SCOPE_RULE + wrapped), skills, memory, repo_map, specs, callers, diff, joined by `\n\n`.
- [F2] `reviewer-core/src/review/run.ts:188` trace-only whole-diff assemble; `:207-228` per-chunk assemble + completeStructured with `model`, `sessionId`.
- [F3] `reviewer-core/src/llm/usage.ts:7-14` emitUsage swallows hook errors; `:26` estimateTokens = ceil(chars/4); exported from index.ts:84.
- [F4] `reviewer-core/src/review/pool.ts:7-11` mapOrdered fn gets `(item, index)`.
- [F5] `server/src/platform/run-logger.ts:50-53` RunLogger.event publishes to RunBus (Live Log + trace) AND mirrors to pino → not the sink.
- [F6] `server/src/platform/container.ts:121-126` 4th ctor arg `log?: GitHubClientLogger` (warn only, `adapters/github/octokit.ts:29`); `app.ts:52` passes app.log.
- [F7] `server/src/platform/logging.ts:12-22` REDACT_PATHS censor keys apiKey/api_key/key/token/secret/password/authorization at depth ≤3; `test/logging-redact.test.ts` pattern for asserting output.
- [F8] `server/src/platform/config.ts:104-106` LLM_PROVIDER_OVERRIDE refused in production; `:57` API_HOST default 127.0.0.1; `:60` NODE_ENV enum.
- [F9] `server/src/modules/reviews/domain/prompt.ts:14` taskLine embeds PR title + author.
- [F10] `server/src/modules/intent/application/intent-service.ts:311-333` derive: sources → renderSourcesBlock → classify(key.resolved, [system, user]); `key.hash` at :299.
- [F11] `server/src/modules/conventions/infrastructure/llm-model.ts:18-31` model resolved inside propose; service call at `conventions-service.ts:100`.
- [F12] grep `completeStructured(|reviewPullRequest(` in server/src (excl. adapters/llm): run-executor.ts:276, intent llm-model.ts:26, conventions llm-model.ts:21 — only 3 prompt builders.
## Mirrors
- `REPO_INTEL_ENABLED` / `LLM_PROVIDER_OVERRIDE` in config.ts — flag parsing + production refusal.
- `server.ts:35-41` mock-override boot warning — verbose warning.
- `emitUsage` — never-throwing hook; `onUsage` plumbing in run.ts/run-executor — `onPrompt`.
- `test/logging-redact.test.ts` — Writable stream capture for sentinel assertions.
## Skill map (from routing.json)
| Step | Files (glob) | Skills | Key rules |
|---|---|---|---|
| S1,S2 | reviewer-core/src/** | onion-architecture, typescript-expert | core pure, no I/O; explicit public types; export via index.ts |
| S3 | server/src/platform/** (config.ts imports zod) | onion-architecture, typescript-expert, security, zod | env only in config.ts; A09 never log secrets/redact; zod: no coerce.boolean [I2] |
| S3 | server/src/server.ts | fastify-best-practices | pino structured logging, redact |
| S4,S5 | server/src/modules/** incl. composition.ts | onion-architecture, typescript-expert, security | application takes ports not Container; wiring in composition.ts; adapter owns model resolution |
| S1-S5 tests, S6 docs | */test/**, README.md | — | — |
No `vendor/shared` change → no drift_check.
## Risks
- A future section added to assemblePrompt without meta → S1 test asserts one meta per rendered section heading.
- Field names colliding with REDACT keys → builder test asserts no `key`/`token` keys.
- Verbose on a shared host → triple gate + production throw + boot warn.
## Notes for reviewers
- Architecture: core returns metadata only; server logs via Container-owned PromptLog injected as a port; no cross-module imports.
- Security: record type has no free-text content field; verbose = identifiers only; sentinel tests cover diff, PR body, intent, specs, skills, callers, repo map, tickets, conventions sample.
