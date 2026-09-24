# Development Plan: Safe structured logging of prompt assembly
Packages: reviewer-core, server · Base: feat/lab3@f0ed19c · Spec: none
Context pack: docs/plans/2026-09-24-prompt-assembly-logging.context.md

## Goal
Every prompt sent to a model (review single-pass / each map-reduce chunk, intent classification,
conventions extraction) emits ONE pino line `prompt_assembled`: feature, correlation id,
provider + model, per-section name / source / trust / chars / est. tokens. The record type has
no content field, so diff, specs, PR body, intent, tickets, docs and secrets cannot be logged.
`PROMPT_LOG_VERBOSE=true` adds identifiers (never content), local dev only.

## Out of scope
- RunBus / Live Log / run_traces changes; content hashes or previews; client; e2e; DB.

## Decisions
- Core stays pure: `assemblePrompt` also returns `sections: PromptSectionMeta[]` (numbers + enums); `ReviewInput.onPrompt` per LLM call; core never logs — [F1][F2], reviewer-core AGENTS "Stays pure".
- One event per prompt with `sections[]`; map-reduce → one per chunk with `chunk:{index,total}`. Trace-only whole-diff assembly (run.ts:188) is not sent → not logged [F2].
- Sink = pino app logger via Container-owned `PromptLog`, level `info`; NOT RunBus (user-visible, persisted) [F5][F6].
- Correlation id: review = `runId`; intent = `intent:<prId>:<hash[0..12]>` (flight key [I3]); conventions = `scanId`. `sessionId` not logged (repo/agent names).
- Safe by construction: record built by explicit field copy (never spread inputs); names/sources are closed unions + runtime allowlist (unknown → dropped); no field named `key`/`token`/… (redact would mangle it) [F7].
- No hashes (a hash confirms guessed low-entropy content, e.g. a short PR body). Verbose adds ONLY identifiers: `chunkLabel` (file path) for reviews, `sources[{kind,ref,status}]` for intent.
- Verbose gate: `PROMPT_LOG_VERBOSE==='true' && NODE_ENV==='development' && isLoopbackHost(API_HOST)`; `'true'` + production → loadConfig throws (mirrors LLM_PROVIDER_OVERRIDE) [I2][F8]; loud boot warn when on.
- Redact backstop: add `messages`, `*.messages` to REDACT_PATHS [F7].

## Steps
### S1 — Section metadata in assemblePrompt [reviewer-core]
- Files: M `reviewer-core/src/prompt.ts`; M `reviewer-core/src/index.ts`; M `reviewer-core/test/prompt.test.ts`
- Change: export `PromptSectionName` (system, injection_guard, task, pr_description, intent_rule, intent, skills, memory, repo_map, specs, callers, diff), `PromptSectionSource`, `PromptSectionMeta {name; source; role; trust:'trusted'|'untrusted'; chars; tokens; items?; truncated?}`. `AssembledPrompt.sections` in render order; chars = the exact string the section contributes (heading + wrapper); tokens = `estimateTokens` [F3]. `task` is untrusted (PR title/author [F9]). `items` for skills/memory/specs; `truncated` for pr_description. Omitted slots absent; messages/assembly byte-identical.
- Rules: keep "omits empty sections"; don't touch INJECTION_GUARD/wrapUntrusted; export from index.ts.
- Tests: all slots → order/names/trust; omitted absent; truncated at 4k; Σchars ≤ message lengths; existing cases unchanged.
- Done when: `cd reviewer-core && npm test && npm run typecheck`

### S2 — onPrompt hook in reviewPullRequest [reviewer-core]
- Files: M `reviewer-core/src/review/run.ts`; M `reviewer-core/src/index.ts`; M `reviewer-core/test/run.test.ts`
- Change: `ReviewInput.onPrompt?: (e: PromptAssembledEvent) => void`; `PromptAssembledEvent {chunkIndex; chunkCount; chunkLabel; mode; model; sections}`. Call in the mapOrdered callback (its `index` [F4]) after assemblePrompt, before completeStructured, inside try/catch like `emitUsage` [F3].
- Rules: fixtures only [I5].
- Tests: single-pass → 1 event; map-reduce 2 files → 2 events, total=2; throwing hook → review completes.
- Done when: `cd reviewer-core && npm test && npm run typecheck`; `cd server && npx vitest run test/prompt-callers.test.ts` [I6]

### S3 — Config gate + PromptLog sink + redact [server]
- Files: M `server/src/platform/config.ts`; A `server/src/platform/prompt-log.ts`; M `server/src/platform/logging.ts`; M `server/src/platform/container.ts`; M `server/src/server.ts`
- Change: config: `PROMPT_LOG_VERBOSE: z.string().optional()` + explicit compare [I2]; `promptLogVerbose: boolean`; `isLoopbackHost` (127.0.0.0/8, `::1`, `localhost`). prompt-log.ts: `PromptLogEntry` (feature 'review'|'intent'|'conventions', correlationId, provider, model, sections, chunk?, verbose?), pure `buildPromptLogRecord(entry,{verbose})` → `{evt:'prompt_assembled',…,totalChars,totalTokens}`, `sectionMeta(name,source,trust,text,extra?)` (numbers only out), `PromptLogPort` + class `PromptLog` (never throws; no-op if logger lacks `info`). Container: `readonly promptLog`; 4th ctor arg widened to `GitHubClientLogger & { info?: … }` [I1][F6]. server.ts: boot warn when verbose on.
- Rules: [I2]; `process.env` only in config.ts (onion §8).
- Tests: A `server/test/prompt-log.test.ts` — gate: production+'true' → throws; test or dev+0.0.0.0 → false; dev+127.0.0.1 → true; 'false'/'' → false. Builder drops unknown names, omits `verbose` when off. M `server/test/logging-redact.test.ts` — `messages` content redacted.
- Done when: `./scripts/gates.sh`

### S4 — Wire review runs [server]
- Files: M `server/src/modules/reviews/application/run-executor.ts`; M `server/src/modules/reviews/composition.ts`; M `server/test/prompt-log.test.ts`; M `server/test/reviews-service.test.ts` (executor → promptLog wiring test)
- Change: `RunExecutorDeps.promptLog?: PromptLogPort`; `review()` passes `onPrompt` → `promptLog?.assembled({feature:'review', correlationId: runId, provider: agent.provider, model: agent.model, chunk, sections, verbose:{chunkLabel}})`. Composition passes `c.promptLog`.
- Rules: [I4].
- Tests: sentinel — real `reviewPullRequest` + stub LLM; diff, PR body, intent, callers, repoMap, skills, specs each carry a unique sentinel; captured JSON (verbose on AND off) contains none; provider/model/runId present.
- Done when: `./scripts/gates.sh`

### S5 — Wire intent + conventions [server]
- Files: M `server/src/modules/intent/application/intent-service.ts`, `…/intent/composition.ts`; M `server/src/modules/conventions/application/{ports.ts,conventions-service.ts}`, `…/conventions/infrastructure/llm-model.ts`, `…/conventions/composition.ts`
- Change: intent: optional dep `promptLog`; in `derive()` before `classify` log `system`(builtin) + `intent_sources`(untrusted, items=sources.length), provider/model = `key.resolved` [F10]. conventions: `propose(…, signal, onResolved?: (m:{provider,model}) => void)` called by the adapter after model resolution, before the SDK call [F11]; service logs `system` + `repository_sample`(items=sampled files), correlationId=scanId.
- Rules: [I1] optional trailing param keeps fakes valid; [I4].
- Tests: M `server/test/conventions-service.test.ts`; intent case in `prompt-log.test.ts` (no intent unit test exists) — body/ticket/sample sentinels absent; provider/model/correlationId present.
- Done when: `./scripts/gates.sh`

### S6 — Docs
- Files: M `server/README.md` (Environment row `PROMPT_LOG_VERBOSE`; line in "Review context"); M `reviewer-core/README.md` (`sections`, `onPrompt`)
- Done when: `./scripts/gates.sh`

## Contracts & migrations
- none (no `@devdigest/shared` change).

## Verification
- `./scripts/gates.sh` (no `--integration`: no DB / `*.it.test.ts` change).
- Manual: `LLM_PROVIDER_OVERRIDE=mock PROMPT_LOG_VERBOSE=true ./scripts/dev.sh`, review PR #482 → one `prompt_assembled` line per call, no diff text in stdout; `NODE_ENV=production PROMPT_LOG_VERBOSE=true` → boot refused.

## Open questions / assumptions
- Level `info` vs `debug` — default: `info`.
- Dev + `API_HOST=0.0.0.0` + flag: fail loudly? — **decided (user, 2026-09-24):** verbose stays off, and the server logs ONE boot `warn` naming why (`promptLogVerboseDisabledReason`); a separate boot `warn` is logged when verbose is ON.
- Other prompt builders — default: none beyond the 3 found [F12].

## Fix round r2 (after review r1, 2026-09-24)
- F1: boot `warn` when verbose is ON (was only when requested-but-disabled) — D7c.
- F2: intent test feeds a ticket that loads (`ok:true`) with its own sentinel, referenced from the body; import `PromptLogPort` in `server/test/prompt-log.test.ts`.
- F3: "every section" — intent and conventions also log their instruction/wrapper text as a `task` section; `repository_sample` is measured on the text actually sent (after wrapping). Summed section chars ≈ message length.
- F4: the server's section-name allowlist is derived from a list reviewer-core exports (plus server-only names) so a new core section cannot be dropped silently.

