# Safe structured logging of prompt assembly

**Status:** in-progress
**Lesson / ticket:** L03

## Goal
Give a developer or operator a text-free, structured view of how every LLM
prompt was assembled (sections, sizes, model, correlation), so prompt bloat
and assembly regressions can be diagnosed from logs. A verbose mode that only
works locally gives a deeper comparison across runs.

One pino record, `msg: 'prompt: assembled'`, is written per assembled prompt
for two callers: the reviewer (`reviewPullRequest`) and the intent classifier.
Each record carries: correlation ID, PR ID, provider/model, and per section
the name, source, role, untrusted flag, chars and `tokens_est`. It never
carries section text.

**Verbose mode** (`PROMPT_LOG=verbose`, ignored in production with one
startup warning) adds:
- one record per map-reduce chunk;
- a 12-hex sha256 fingerprint per section;
- the diff's file paths with their char sizes;
- skill names;
- intent source refs (spec paths and `#N`).

## Non-goals
- Other LLM callers (conventions, brief, onboarding …) are not instrumented.
- `run_traces.prompt_assembly` (full text persisted in the DB,
  `run-executor.ts:330`) is unchanged.
- The Live Log / SSE events (`RunLogger.event`) are unchanged: no new
  RunEventKind, no new SSE message.
- No `@devdigest/shared` contract, DB schema, migration, dependency or
  `package.json` change.
- No exact tokenizer. Counts are estimates only, in the field `tokens_est`.
- The CI runner (a non-server consumer of reviewer-core) gets no logging.
  `promptTelemetry` is optional and absent there.
- Existing log lines outside this feature are not rewritten.

## Contract
No `@devdigest/shared` change and no route change. Internal shapes only.

**reviewer-core** (`prompt.ts`, `review/run.ts`, exported from `index.ts`):
```ts
type PromptSectionName = 'system_prompt'|'injection_guard'|'task'|'pr_description'|'intent'|'skills'|'memory'|'repo_map'|'specs'|'callers'|'diff';
type PromptSectionSource = 'agent'|'engine'|'pull_request'|'intent_layer'|'skills'|'memory'|'repo_intel'|'specs'|'diff';
interface PromptSection { name; source; role: 'system'|'user'; untrusted: boolean; chars: number; tokens_est: number; fingerprint?: string }
function estimateTokens(text: string): number            // Math.ceil(text.length / 4)
function assemblePrompt(parts, opts?: { fingerprint?: (text: string) => string }): AssembledPrompt  // AssembledPrompt += sections: PromptSection[]
interface PromptAssembledInfo {
  scope: 'run'|'chunk'; mode: ReviewMode; model: string; chunk_count: number;
  chunk_index?: number; chunk_label?: string;            // chunk scope only
  system_chars: number; user_chars: number; total_chars: number; tokens_est: number;
  sections: PromptSection[]; diff_files?: { path: string; chars: number }[]; // diff_files: verbose, run scope
}
interface PromptTelemetryOptions { detail: 'summary'|'verbose'; onPrompt: (i: PromptAssembledInfo) => void; fingerprint?: (text: string) => string }
// ReviewInput += promptTelemetry?: PromptTelemetryOptions
```
Section mapping (`name` → `source`, `role`, `untrusted`):

| name | source | role | untrusted |
|---|---|---|---|
| system_prompt | agent | system | false |
| injection_guard | engine | system | false |
| task | pull_request | user | false |
| pr_description | pull_request | user | true |
| intent | intent_layer | user | true |
| skills | skills | user | false |
| memory | memory | user | false |
| repo_map | repo_intel | user | true |
| specs | specs | user | true |
| callers | repo_intel | user | true |
| diff | diff | user | true |

For a user section, `chars` = the length of the exact string pushed to
`userSections`, heading and wrapper included.

**Server log record** (`platform/prompt-log.ts`), logged as
`logger.info(record, 'prompt: assembled')`:

| field | summary | verbose |
|---|---|---|
| `event: 'prompt.assembled'`, `prompt_log`, `feature: 'review'\|'intent'`, `scope: 'run'\|'chunk'\|'classifier'` | yes | yes |
| `correlation_id`, `pr_id`, `run_id?` (review), `run_ids?` (intent pre-work), `agent?`, `provider`, `model` | yes | yes |
| `mode?`, `chunk_count?`, `chunk_index?`, `system_chars`, `user_chars`, `total_chars`, `tokens_est` | yes | yes |
| `sections[]`: `name, source, role, untrusted, chars, tokens_est` | yes | yes |
| `sections[].fingerprint` (12 lowercase hex) | — | yes |
| `sections[].ref` (intent only; `null` for title/branch/external_link) | — | yes |
| `chunk_label`, `diff_files[]`, `skills[]` (names) | — | yes |

- `reqId` is not built by us. It arrives through the pino child bindings of
  `req.log`.
- Intent sections are named `system_prompt` (source `intent_classifier`),
  `header` (source `pull_request`) and `S1…Sn` (source = the
  `IntentSourceKind`, untrusted).

**Correlation ids.** Review → `runId`. Intent →
`intent:<prId>:<inputHash[0..12]>`, plus `run_ids` when called from review
pre-work; the same id is added to both `'intent: derived'` log lines.

**Config:** `AppConfig += promptLog: 'summary'|'verbose'; promptLogVerboseIgnored: boolean`.
`config.ts` also gains `startupWarnings(config): { obj: Record<string, unknown>; msg: string }[]`.

**`server/.env.local` is not loaded** by this server (`config.ts:1` loads only
`.env`). Set `PROMPT_LOG=verbose pnpm dev`, or add it to `server/.env`.

## Acceptance criteria
- [ ] Mode `summary`. A review run with a logger emits exactly one
  `'prompt: assembled'` record per agent run.
  - It has `feature:'review'`, `scope:'run'`, and
    `correlation_id === run_id === <agent_runs.id>`.
  - It carries `pr_id`, `provider`, `model`, `mode` and `chunk_count`.
  - `sections` hold only `name/source/role/untrusted/chars/tokens_est`.
- [ ] Mode `verbose`, map-reduce over N files: 1 `run` record plus N `chunk`
  records (`chunk_index` 0…N-1, `chunk_label` = file path).
  - Every section has a `fingerprint` matching `/^[0-9a-f]{12}$/`.
  - The run record has `diff_files` (N entries, `{path, chars}`) and
    `skills` (enabled skill names).
- [ ] The intent classifier emits one `feature:'intent'`, `scope:'classifier'`
  record per non-cached classification.
  - `correlation_id` is `intent:<prId>:<12 chars>` and matches the following
    `'intent: derived'` line.
  - In review pre-work, `run_ids` lists the queued run ids.
- [ ] Across every emitted record, in both modes, none of these canary
  strings appears: diff body, PR description, PR title, spec/issue text,
  skill body, memory, callers, repo map, intent summary, a secret-shaped
  literal.
- [ ] `loadConfig({NODE_ENV:'production', PROMPT_LOG:'verbose'})` yields
  `promptLog:'summary'`, and `startupWarnings` returns exactly one warning.
  In development it yields `'verbose'` and `[]`.
- [ ] The assembled `messages` / `assembly` for identical inputs are
  byte-identical to before the change (existing prompt tests are unchanged
  and green).
- [ ] A Fastify logger built from `loggerOptions` writes `[REDACTED]` in
  place of an `apiKey` or `token` value.

## Test plan
| Package | Command | Needs Docker? | Covers |
|---|---|---|---|
| reviewer-core | `npm run typecheck && npm test` | no | section metadata / prompt telemetry; existing prompt/run tests unchanged |
| server | `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` | no | config, startup warning, redact, prompt-log record builder, intent classifier pure part |
| server | `../scripts/hermetic.sh pnpm exec vitest run .it.test` | yes | review run wiring; intent classifier integration; `skills-prompt.it.test.ts` unchanged |
| all | `scripts/check-all.sh` (repo root) | yes | everything CI runs |
